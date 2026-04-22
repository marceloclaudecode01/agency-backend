import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { trackAgentExecution } from './agent-performance-tracker';
import { pickBestProducts, ShopeeProduct, fetchConversionSummary, generateAffiliateLink } from '../services/shopee-affiliate.service';
import { askGemini } from './gemini';

/**
 * Shopee Affiliate Agent — Publishes 3 posts/day on Newplay page
 *
 * Schedule: 09:00, 14:00, 19:00 (peak engagement hours)
 *
 * Flow:
 * 1. Fetch top products from Shopee API (high commission × high sales)
 * 2. Exclude products already posted in last 7 days
 * 3. Generate engaging Facebook post via AI
 * 4. Save as ScheduledPost with APPROVED status (auto-publish via scheduler)
 */

const NEWPLAY_PAGE_ID = '109147355169712';
const POSTS_PER_RUN = 5; // 5 posts per single daily run, staggered to peak hours

async function getNewplayClientId(): Promise<string | null> {
  const client = await prisma.client.findFirst({
    where: {
      OR: [
        { facebookPageId: NEWPLAY_PAGE_ID },
        { name: { contains: 'NewPlay', mode: 'insensitive' } },
      ],
      isActive: true,
    },
    select: { id: true },
  });
  return client?.id || null;
}

async function getRecentlyPostedProducts(clientId: string | null, days = 7): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const recent = await prisma.scheduledPost.findMany({
    where: {
      clientId,
      createdAt: { gte: since },
      topic: { startsWith: '[SHOPEE]' },
    },
    select: { topic: true },
  });

  return recent.map(p => p.topic.replace('[SHOPEE] ', '').toLowerCase());
}

async function generateShopeePost(product: ShopeeProduct): Promise<{
  message: string;
  hashtags: string[];
}> {
  const commissionPct = (product.commissionRate * 100).toFixed(0);
  const hasPrice = product.price > 0;
  const priceStr = hasPrice ? `R$${product.price.toFixed(2)}` : '';

  const starsStr = (product.ratingStar ?? 0) >= 4.0
    ? `${'⭐'.repeat(Math.round(product.ratingStar!))} ${product.ratingStar}`
    : '';
  const salesStr = product.sales >= 1000
    ? `${(product.sales / 1000).toFixed(1).replace('.0', '')}mil`
    : `${product.sales}`;

  const prompt = `
Voce e o perfil de "achadinhos" que manja de ofertas — mistura de amigo(a) que indica o melhor da Shopee com entusiasmo real.
Objetivo: criar um post irresistivel que PARA O SCROLL e gera clique no botao "Comprar agora". Publico: mulheres 20-45 (donas de casa, maes, fitness), mas tambem jovens 16-28.
IMPORTANTE: O link sera postado como comentario separado — NAO mencione link no texto. NAO escreva "link nos comentarios".

Produto:
- Nome: ${product.productName}
${hasPrice ? `- Preco: ${priceStr}` : '- Preco: nao disponivel (NAO invente preco, NAO escreva R$0)'}
- Vendas: ${salesStr}+ vendidos
- Avaliacao: ${starsStr || 'popular'}
- Loja: ${product.shopName || 'Shopee'}

ESTILO OBRIGATORIO:
- Tom: empolgado, genuino, tipo "gente achei esse produto e precisei compartilhar!"
- Emocao: surpresa com o achado, entusiasmo real, prova social (vendas/avaliacoes)
- Energia: ALTA mas acessivel. Como se estivesse indicando pra amiga
- Urgencia: "corre que ta com preco de achado", "esse nao dura muito"

FORMATO (siga esta estrutura):
Linha 1: emoji + hook que para o scroll (max 12 palavras${hasPrice ? `, pode incluir o preco ${priceStr}` : ', foque no beneficio ou surpresa'})
Linha 2: (linha vazia)
Linha 3-5: 2-3 beneficios do produto com emojis (use ✅ 🔥 😍 ✨, destaque qualidade/praticidade)
Linha 6: ${starsStr ? `⭐ ${product.ratingStar} estrelas | ${salesStr}+ vendidos na Shopee` : `🔥 ${salesStr}+ ja compraram`}
Linha 7: (linha vazia)
Linha 8: CTA — "corre pra garantir o seu", "ta indo rapido", "aproveita enquanto tem" (SEM mencionar link)

REGRAS:
1. Emojis: 😍 🔥 ✨ ✅ 👇 💖 (max 6, estilo achadinhos)
2. ${hasPrice ? `Inclua o preco (${priceStr}) no hook ou corpo` : 'NAO invente preco. NAO escreva R$0,00 ou R$0. Foque em beneficio + social proof'}
3. Max 280 caracteres no texto total (sem hashtags)
4. NUNCA escreva "link nos comentarios", "clica no link" ou referencia a link
5. Portugues brasileiro informal e VARIADO (olha isso, achei demais, gente, serio, simplesmente, apaixonada — varie sempre)
6. Hashtags: 4-5 relevantes (categoria + shopee + achadinhos)
7. NUNCA escreva "R$0", "R$0,00", "zero reais" — se nao tem preco, nao mencione valor

Retorne APENAS JSON valido:
{
  "message": "texto completo do post com quebras de linha",
  "hashtags": ["shopee", "achadinhos", "categoria", "mais2relevantes"]
}`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      message: hasPrice
        ? `😍 ${product.productName} por ${priceStr}!\n\n✅ ${salesStr}+ vendidos na Shopee\n⭐ Achadinho que ta bombando\n\nCorre pra garantir o seu ✨`
        : `😍 Achei na Shopee: ${product.productName}!\n\n✅ ${salesStr}+ vendidos\n⭐ Produto queridinho da galera\n\nAproveita enquanto tem ✨`,
      hashtags: ['shopee', 'achadinhos', 'oferta'],
    };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  // Sanitize: remove any R$0 / R$0,00 / R$0.00 the LLM invented despite instructions
  let msg: string = parsed.message || product.productName;
  msg = msg.replace(/R\$\s*0[.,]00/g, '').replace(/R\$\s*0\b/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    message: msg,
    hashtags: parsed.hashtags || ['shopee', 'oferta'],
  };
}

export async function runShopeeAffiliate() {
  const clientId = await getNewplayClientId();
  if (!clientId) {
    await agentLog('ShopeeAffiliate', 'Newplay client not found in DB — skipping', { type: 'error' });
    return;
  }

  const recentNames = await getRecentlyPostedProducts(clientId);
  const products = await pickBestProducts(10, recentNames);

  if (products.length === 0) {
    await agentLog('ShopeeAffiliate', 'No eligible products found (all recently posted or low quality)', { type: 'info' });
    return;
  }

  // Peak hours BRT (UTC-3): 09h, 11h, 14h, 17h, 19h → UTC: 12, 14, 17, 20, 22
  const peakHoursUTC = [12, 14, 17, 20, 22];
  let created = 0;
  for (let i = 0; i < Math.min(products.length, POSTS_PER_RUN); i++) {
    const product = products[i];
    try {
      const { message, hashtags } = await generateShopeePost(product);
      const hashtagStr = hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ');
      const fullMessage = `${message}\n\n${hashtagStr}`;

      // Stagger posts across peak hours (today or tomorrow if hour already passed)
      const scheduledFor = new Date();
      const targetHour = peakHoursUTC[i % peakHoursUTC.length];
      scheduledFor.setUTCHours(targetHour, Math.floor(Math.random() * 15), 0, 0);
      if (scheduledFor.getTime() < Date.now() + 5 * 60_000) {
        scheduledFor.setDate(scheduledFor.getDate() + 1); // tomorrow if too late
      }

      // Save product data for HyperFrames video rendering (scheduler reads carouselData.shopeeProduct)
      const carouselData = {
        shopeeProduct: {
          productName: product.productName,
          price: product.price,
          sales: product.sales,
          imageUrl: product.imageUrl,
          commissionRate: product.commissionRate,
          shopName: product.shopName || '',
          ratingStar: product.ratingStar || 4.5,
          productLink: product.productLink,
          offerLink: product.offerLink || '',
        },
      };

      // STRICT: never publish without affiliate-tracked link (s.shopee.com.br)
      let affiliateLink = product.offerLink || '';
      if (!affiliateLink) {
        console.warn(`[ShopeeAffiliate] ⚠️ offerLink empty for "${product.productName.slice(0, 40)}" — generating via API`);
        try {
          affiliateLink = await generateAffiliateLink(product.productLink) || '';
        } catch (err: any) {
          console.error(`[ShopeeAffiliate] generateAffiliateLink failed: ${err.message}`);
        }
      }
      if (!affiliateLink) {
        console.error(`[ShopeeAffiliate] ❌ SKIPPING "${product.productName.slice(0, 40)}" — no affiliate link available (zero commission)`);
        continue;
      }

      const createdPost = await prisma.scheduledPost.create({
        data: {
          topic: `[SHOPEE] ${product.productName.slice(0, 80)}`,
          message: fullMessage,
          hashtags: hashtagStr,
          imageUrl: product.imageUrl || null, // Product image from Shopee API
          source: affiliateLink,
          platform: 'facebook',
          scheduledFor,
          contentType: 'video', // HyperFrames rendered video (GSAP animated, 15s, 5 scenes)
          status: 'APPROVED', // Skip governor — affiliate posts are pre-validated
          governorDecision: 'APPROVE',
          governorReviewedAt: new Date(),
          clientId,
          carouselData,
        },
      });

      created++;
      await agentLog('ShopeeAffiliate', `Post created: ${product.productName.slice(0, 50)} (${(product.commissionRate * 100).toFixed(0)}% commission, ${product.sales} sales)`, { type: 'result' });
    } catch (err: any) {
      await agentLog('ShopeeAffiliate', `Failed to create post for ${product.productName.slice(0, 40)}: ${err.message}`, { type: 'error' });
    }
  }

  if (created > 0) {
    await agentLog('ShopeeAffiliate', `${created} Shopee affiliate post(s) queued for Newplay`, { type: 'result' });
  }
}

/**
 * Start Shopee Affiliate agent — 5 posts/day (single run, staggered schedule)
 * Cron: 14:00 BRT (17:00 UTC) — generates 5 posts scheduled for 09h, 11h, 14h, 17h, 19h BRT
 */
export async function startShopeeAffiliateAgent() {
  // Auto-register in DB so scheduler picks it up
  try {
    await prisma.agent.upsert({
      where: { name: 'shopee-affiliate' },
      update: {},
      create: {
        name: 'shopee-affiliate',
        function: 'shopee-affiliate',
        description: 'Shopee affiliate product posts — achadinhos multi-nicho (casa, moda, bebe, beleza, tech)',
        status: process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET ? 'active' : 'paused',
        autonomyLevel: 5,
        cronExpression: '0 12,17,22 * * *',
      },
    });
  } catch {}

  if (!process.env.SHOPEE_APP_ID || !process.env.SHOPEE_SECRET) {
    console.log('[ShopeeAffiliate] DISABLED — SHOPEE_APP_ID/SHOPEE_SECRET not set');
    return;
  }

  // 1 run per day at peak engagement (was 3x/day — saves LLM tokens + API calls)
  cron.schedule('0 17 * * *', async () => {  // 14:00 BRT
    await trackAgentExecution('shopee-affiliate', runShopeeAffiliate);
  });

  // Daily conversion report log — 08:00 BRT (11:00 UTC)
  cron.schedule('0 11 * * *', async () => {
    try {
      const summary = await fetchConversionSummary(1);
      await agentLog('ShopeeAffiliate', `Daily report (24h): ${summary.totalConversions} conversions, ${summary.totalOrders} orders, R$${summary.totalCommission.toFixed(2)} commission`, { type: 'result' });
    } catch (err: any) {
      await agentLog('ShopeeAffiliate', `Daily report failed: ${err.message}`, { type: 'error' });
    }
  });

  console.log('[ShopeeAffiliate] Shopee affiliate agent started (5 posts/day, cron 14h BRT)');

  // One-shot test: run immediately if SHOPEE_TEST_RUN=1 (remove var after use)
  if (process.env.SHOPEE_TEST_RUN === '1') {
    console.log('[ShopeeAffiliate] TEST RUN triggered via SHOPEE_TEST_RUN=1');
    setTimeout(() => runShopeeAffiliate().catch(e => console.error('[ShopeeAffiliate] Test run error:', e.message)), 5000);
  }
}
