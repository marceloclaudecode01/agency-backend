import prisma from '../config/database';
import { fetchBestProducts, fetchTrendingProducts, TikTokProduct } from './tiktok-researcher.agent';
import { writeProductCopy, ProductPost } from './copywriter.agent';
import { analyzePageGrowth } from './growth-analyst.agent';
import { notificationsService } from '../modules/notifications/notifications.service';

export interface OrchestrationResult {
  productsFound: number;
  postsCreated: number;
  insights: any;
  posts: any[];
}

// Orquestra todos os agentes para criar posts de produto
export async function orchestrateProductPosts(
  queryOverride?: string
): Promise<OrchestrationResult> {
  console.log('[Orchestrator] Iniciando ciclo de produtos TikTok Shop...');

  // 1. Analista avalia o que está funcionando
  let insights: any = null;
  try {
    insights = await analyzePageGrowth();
    console.log(`[Orchestrator] Insights obtidos. Melhor tipo: ${insights.bestPerformingType} | Mix: produto ${insights.contentMix.product}%`);
  } catch (err: any) {
    console.warn('[Orchestrator] Analista indisponível, usando padrão:', err.message);
    insights = {
      bestPerformingType: 'produto',
      bestPostingHours: ['12:00', '19:00', '21:00'],
      contentMix: { entertainment: 30, product: 50, engagement: 20 },
      confidenceScore: 3,
    };
  }

  // 2. Pesquisador busca produtos trending
  let products: TikTokProduct[] = [];
  try {
    products = queryOverride
      ? await fetchTrendingProducts(queryOverride, 15)
      : await fetchBestProducts();
    console.log(`[Orchestrator] ${products.length} produtos encontrados`);
  } catch (err: any) {
    console.error('[Orchestrator] Pesquisador falhou:', err.message);
    return { productsFound: 0, postsCreated: 0, insights, posts: [] };
  }

  if (products.length === 0) {
    console.warn('[Orchestrator] Nenhum produto encontrado');
    return { productsFound: 0, postsCreated: 0, insights, posts: [] };
  }

  // 3. Estrategista decide quantos posts de produto criar baseado no mix
  const productRatio = insights.contentMix.product / 100;
  const postsToCreate = Math.max(1, Math.min(3, Math.round(3 * productRatio)));
  console.log(`[Orchestrator] Criando ${postsToCreate} posts de produto`);

  // 4. Copywriter cria o copy para os melhores produtos
  const copyTypes: Array<'prova_social' | 'urgencia' | 'problema_solucao' | 'curiosidade' | 'transformacao'> =
    ['prova_social', 'urgencia', 'problema_solucao', 'curiosidade', 'transformacao'];

  const bestHours = insights.bestPostingHours || ['12:00', '19:00', '21:00'];
  const today = new Date();
  const createdPosts: any[] = [];

  for (let i = 0; i < postsToCreate; i++) {
    const product = products[i];
    const copyType = copyTypes[i % copyTypes.length];

    try {
      const copy: ProductPost = await writeProductCopy(product, copyType);

      // Monta horário de publicação
      const timeStr = bestHours[i] || copy.suggestedTime || '19:00';
      const [hours, minutes] = timeStr.split(':').map(Number);
      const scheduledFor = new Date(today);
      scheduledFor.setHours(hours, minutes + (i * 90), 0, 0); // 90min de intervalo

      const hashtagsStr = copy.hashtags
        .map((h: string) => `#${h.replace('#', '')}`)
        .join(' ');

      const saved = await prisma.scheduledPost.create({
        data: {
          topic: `Produto: ${product.title.substring(0, 60)}`,
          message: copy.message,
          hashtags: hashtagsStr,
          imageUrl: copy.imageUrl,
          status: 'APPROVED',
          scheduledFor,
        },
      });

      createdPosts.push(saved);
      console.log(`[Orchestrator] Post ${i + 1} criado: "${product.title.substring(0, 40)}" (${copyType})`);

      // Pausa entre chamadas Gemini
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`[Orchestrator] Erro ao criar post ${i + 1}:`, err.message);
    }
  }

  // 5. Notifica admins
  if (createdPosts.length > 0) {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      await notificationsService.createAndEmit(
        admin.id,
        'TASK_ASSIGNED',
        'Posts de produtos agendados!',
        `${createdPosts.length} post(s) de produtos TikTok Shop criados com copy persuasivo`
      );
    }
  }

  return {
    productsFound: products.length,
    postsCreated: createdPosts.length,
    insights,
    posts: createdPosts,
  };
}
