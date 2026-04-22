import crypto from 'crypto';
import https from 'https';

const SHOPEE_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

function getCredentials() {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_SECRET;
  if (!appId || !secret) throw new Error('SHOPEE_APP_ID or SHOPEE_SECRET not set');
  return { appId, secret };
}

function buildAuth(payload: string): string {
  const { appId, secret } = getCredentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const factor = appId + timestamp + payload + secret;
  const signature = crypto.createHash('sha256').update(factor).digest('hex');
  return `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`;
}

async function shopeeQuery<T = any>(query: string): Promise<T> {
  const payload = JSON.stringify({ query });
  const auth = buildAuth(payload);

  return new Promise((resolve, reject) => {
    const url = new URL(SHOPEE_API_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.errors) reject(new Error(JSON.stringify(parsed.errors)));
          else resolve(parsed.data as T);
        } catch (e) {
          reject(new Error(`Shopee API parse error: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Shopee API timeout')); });
    req.write(payload);
    req.end();
  });
}

export interface ShopeeConversion {
  conversionId: string;
  clickTime: string;
  purchaseTime: string;
  totalCommission: number;
  sellerCommission: number;
  shopeeCommissionCapped: number;
  buyerType: string;
  device: string;
  utmContent: string;
  orders: { orderId: string }[];
}

export interface ShopeeConversionSummary {
  totalConversions: number;
  totalOrders: number;
  totalCommission: number;
  conversions: ShopeeConversion[];
}

/**
 * Fetch conversion report from Shopee Affiliate API.
 */
export async function fetchConversionReport(startTs: number, endTs: number, limit = 50): Promise<ShopeeConversion[]> {
  const data = await shopeeQuery<any>(`{
    conversionReport(purchaseTimeStart: ${startTs}, purchaseTimeEnd: ${endTs}, limit: ${limit}) {
      nodes {
        conversionId
        clickTime
        purchaseTime
        totalCommission
        sellerCommission
        shopeeCommissionCapped
        buyerType
        device
        utmContent
        orders { orderId }
      }
    }
  }`);

  const nodes = data?.conversionReport?.nodes || [];
  return nodes.map((n: any) => ({
    conversionId: n.conversionId || '',
    clickTime: n.clickTime || '',
    purchaseTime: n.purchaseTime || '',
    totalCommission: parseFloat(n.totalCommission || '0') / 100000,
    sellerCommission: parseFloat(n.sellerCommission || '0') / 100000,
    shopeeCommissionCapped: parseFloat(n.shopeeCommissionCapped || '0') / 100000,
    buyerType: n.buyerType || '',
    device: n.device || '',
    utmContent: n.utmContent || '',
    orders: (n.orders || []).map((o: any) => ({ orderId: o.orderId || '' })),
  }));
}

/**
 * Fetch conversion summary for the last N days.
 */
export async function fetchConversionSummary(days = 7): Promise<ShopeeConversionSummary> {
  const endTs = Math.floor(Date.now() / 1000);
  const startTs = endTs - days * 24 * 60 * 60;

  const conversions = await fetchConversionReport(startTs, endTs);

  const totalOrders = conversions.reduce((sum, c) => sum + c.orders.length, 0);
  const totalCommission = conversions.reduce((sum, c) => sum + c.totalCommission, 0);

  return {
    totalConversions: conversions.length,
    totalOrders,
    totalCommission,
    conversions,
  };
}

export interface ShopeeProduct {
  productName: string;
  commissionRate: number;
  productLink: string;
  offerLink?: string;
  price: number;
  sales: number;
  imageUrl: string;
  shopName?: string;
  ratingStar?: number;
  itemId?: string;
}

export interface ShopeeOffer {
  offerName: string;
  commissionRate: number;
  offerLink: string;
}

/**
 * Fetch top products sorted by sales (sortType=2) with high commission.
 * Returns products sorted by commission * sales (best earning potential).
 */
export async function fetchTopProducts(limit = 20): Promise<ShopeeProduct[]> {
  const data = await shopeeQuery<any>(`{
    productOfferV2(limit: ${limit}, sortType: 2) {
      nodes {
        productName
        commissionRate
        productLink
        offerLink
        price
        sales
        imageUrl
        shopName
        ratingStar
      }
    }
  }`);

  const nodes = data?.productOfferV2?.nodes || [];
  return nodes
    .map((n: any) => ({
      productName: n.productName || '',
      commissionRate: parseFloat(n.commissionRate || '0'),
      productLink: n.productLink || '',
      offerLink: n.offerLink || '',
      price: parseFloat(n.price || '0'), // Shopee API returns price as string in BRL
      sales: parseInt(n.sales || '0', 10),
      imageUrl: n.imageUrl || '',
      shopName: n.shopName || '',
      ratingStar: parseFloat(n.ratingStar || '0'),
    }))
    .filter((p: ShopeeProduct) => p.commissionRate >= 0.05 && p.sales >= 10 && p.price > 0 && p.imageUrl)
    .sort((a: ShopeeProduct, b: ShopeeProduct) => {
      // Score = commission rate * sales (earning potential)
      const scoreA = a.commissionRate * a.sales;
      const scoreB = b.commissionRate * b.sales;
      return scoreB - scoreA;
    });
}

/**
 * Fetch shop offers with highest commissions.
 */
export async function fetchTopShopOffers(limit = 10): Promise<ShopeeOffer[]> {
  const data = await shopeeQuery<any>(`{
    shopOfferV2(limit: ${limit}, sortType: 2) {
      nodes {
        shopName
        commissionRate
        offerLink
      }
    }
  }`);

  const nodes = data?.shopOfferV2?.nodes || [];
  return nodes.map((n: any) => ({
    offerName: n.shopName || '',
    commissionRate: parseFloat(n.commissionRate || '0'),
    offerLink: n.offerLink || '',
  }));
}

/**
 * Fetch Shopee campaign offers (seasonal, thematic).
 */
export async function fetchShopeeOffers(): Promise<ShopeeOffer[]> {
  const data = await shopeeQuery<any>(`{
    shopeeOfferV2 {
      nodes {
        offerName
        commissionRate
        offerLink
      }
    }
  }`);

  const nodes = data?.shopeeOfferV2?.nodes || [];
  return nodes.map((n: any) => ({
    offerName: n.offerName || '',
    commissionRate: parseFloat(n.commissionRate || '0'),
    offerLink: n.offerLink || '',
  }));
}

/**
 * Search products by keyword via Shopee Affiliate API.
 * sortType: 1=relevance, 2=sales, 3=price_asc, 4=price_desc, 5=commission
 */
export async function searchProducts(keyword: string, limit = 10, sortType = 2): Promise<ShopeeProduct[]> {
  const safeKeyword = keyword.replace(/"/g, '\\"');
  const data = await shopeeQuery<any>(`{
    productOfferV2(keyword: "${safeKeyword}", sortType: ${sortType}, limit: ${limit}) {
      nodes {
        itemId
        productName
        commissionRate
        productLink
        offerLink
        price
        sales
        imageUrl
        shopName
        ratingStar
      }
    }
  }`);

  const nodes = data?.productOfferV2?.nodes || [];
  return nodes.map((n: any) => ({
    productName: n.productName || '',
    commissionRate: parseFloat(n.commissionRate || '0'),
    productLink: n.productLink || '',
    offerLink: n.offerLink || '',
    price: parseFloat(n.price || '0'), // Shopee API returns price as string in BRL
    sales: parseInt(n.sales || '0', 10),
    imageUrl: n.imageUrl || '',
    shopName: n.shopName || '',
    ratingStar: parseFloat(n.ratingStar || '0'),
    itemId: n.itemId || '',
  }));
}

/**
 * Generate a short affiliate link for any Shopee URL.
 * This wraps the Shopee generateShortLink mutation so the link has YOUR affiliate tracking.
 */
export async function generateAffiliateLink(originUrl: string, subId?: string): Promise<string | null> {
  const subIds = subId ? `, subIds: ["${subId}"]` : '';
  const safeUrl = originUrl.replace(/"/g, '\\"');
  const data = await shopeeQuery<any>(`mutation {
    generateShortLink(input: { originUrl: "${safeUrl}"${subIds} }) { shortLink }
  }`);
  return data?.generateShortLink?.shortLink || null;
}

// Niche keywords — rotated daily to keep content diverse
// Target: Dia das Mães 2026 (11 de maio) + multi-audience evergreen
// Based on Shopee Affiliate trending categories for Mother's Day Brazil
const NICHE_KEYWORDS = [
  // ─── Dia das Mães: Beleza & Skincare (top seller presente mãe) ───
  'kit skincare feminino',
  'creme anti rugas facial',
  'serum vitamina c rosto',
  'mascara facial hidratante',
  'kit maquiagem completo',
  'paleta sombras profissional',
  'perfume feminino importado',
  'perfume feminino natura',
  'hidratante corporal kit',
  'oleo rosa mosqueta',
  // ─── Dia das Mães: Cuidados Pessoais & Bem-estar ───
  'robe roupao feminino',
  'chinelo pantufa feminina',
  'kit banho presente',
  'difusor aromaterapia',
  'oleo essencial lavanda',
  'massageador eletrico portatil',
  'massageador pescoco cervical',
  'escova secadora cabelo',
  'chapinha prancha cabelo',
  'secador cabelo profissional',
  // ─── Dia das Mães: Joias & Acessórios ───
  'colar feminino prata',
  'brinco feminino dourado',
  'pulseira feminina elegante',
  'relogio feminino dourado',
  'bolsa feminina couro',
  'necessaire feminina viagem',
  'oculos sol feminino',
  // ─── Dia das Mães: Casa & Conforto ───
  'air fryer fritadeira eletrica',
  'cafeteira eletrica',
  'panela eletrica arroz',
  'jogo cama queen',
  'cobertor manta casal',
  'travesseiro ortopedico',
  'almofada massageadora',
  'caneca personalizada mae',
  'porta retrato digital',
  // ─── Dia das Mães: Moda & Estilo ───
  'pijama feminino conjunto',
  'camisola renda feminina',
  'vestido midi feminino',
  'cardigan feminino trico',
  'cachecol echarpe feminina',
  'sandalia confortavel feminina',
  'tenis feminino casual',
  // ─── Dia das Mães: Tech & Gadgets pra mãe ───
  'fone bluetooth sem fio',
  'smartwatch feminino',
  'kindle leitor digital',
  'luminaria led mesa',
  'carregador portatil powerbank',
  // ─── Dia das Mães: Fitness & Saúde ───
  'legging feminina academia',
  'garrafa termica',
  'tapete yoga pilates',
];

// ─── Niche relevance filter ─────────────────────────────────
// Product name MUST contain at least one of these terms to be accepted.
// Updated for Dia das Mães 2026 + evergreen categories
const NICHE_TERMS = [
  // Beleza & Skincare
  'skincare', 'serum', 'vitamina c', 'mascara facial', 'hidratante', 'creme',
  'anti rugas', 'anti idade', 'colageno', 'acido hialuronico', 'protetor solar',
  'maquiagem', 'paleta', 'sombra', 'gloss', 'batom', 'base', 'primer',
  'perfume', 'colonia', 'natura', 'boticario', 'avon',
  'oleo', 'rosa mosqueta', 'capilar', 'niacinamida',
  // Cuidados Pessoais & Bem-estar
  'robe', 'roupao', 'chinelo', 'pantufa', 'kit banho',
  'difusor', 'aromaterapia', 'oleo essencial', 'lavanda',
  'massageador', 'cervical', 'pescoco', 'relaxante',
  'escova secadora', 'chapinha', 'prancha', 'secador', 'babyliss',
  // Joias & Acessórios
  'colar', 'brinco', 'pulseira', 'anel', 'joia', 'prata', 'dourado',
  'relogio feminino', 'relógio feminino', 'bolsa', 'necessaire',
  'oculos', 'óculos',
  // Casa & Conforto
  'air fryer', 'fritadeira', 'cafeteira', 'panela eletrica', 'panela elétrica',
  'jogo cama', 'lencol', 'cobertor', 'manta', 'travesseiro', 'ortopedico',
  'almofada', 'caneca', 'porta retrato',
  'garrafa', 'termica', 'termico',
  // Moda & Estilo Feminino
  'pijama', 'camisola', 'renda', 'vestido', 'midi', 'cardigan', 'trico',
  'cachecol', 'echarpe', 'sandalia', 'sandália', 'confortavel',
  'tenis feminino', 'tênis feminino', 'sapatilha',
  'legging', 'academia', 'fitness', 'conjunto feminino',
  // Tech & Gadgets
  'fone', 'bluetooth', 'smartwatch', 'kindle', 'leitor digital',
  'luminaria', 'led', 'carregador', 'powerbank', 'power bank',
  // Fitness & Saúde
  'yoga', 'pilates', 'tapete', 'colchonete',
];

function isNicheRelevant(productName: string): boolean {
  const name = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove accents
  return NICHE_TERMS.some(term => {
    const normalizedTerm = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.includes(normalizedTerm);
  });
}

/**
 * Pick best products for posting: searches by niche keywords, high commission + high sales.
 * STRICT FILTER: product name must match niche terms (no off-topic junk).
 * Returns `count` products avoiding recently posted ones.
 */
export async function pickBestProducts(count = 3, excludeNames: string[] = []): Promise<ShopeeProduct[]> {
  const excluded = new Set(excludeNames.map(n => n.toLowerCase()));

  // Pick random keywords to search (rotate daily for variety)
  const shuffled = [...NICHE_KEYWORDS].sort(() => Math.random() - 0.5);
  const keywordsToSearch = shuffled.slice(0, 8); // Search 8 keywords per run (more variety)

  const allProducts: ShopeeProduct[] = [];
  for (const keyword of keywordsToSearch) {
    try {
      const results = await searchProducts(keyword, 10, 2); // sort by sales
      allProducts.push(...results);
    } catch {}
  }

  // STRICT niche filter — reject products that don't match our audience
  const nicheProducts = allProducts.filter(p => isNicheRelevant(p.productName));
  const rejected = allProducts.length - nicheProducts.length;
  if (rejected > 0) {
    console.log(`[ShopeeAffiliate] Niche filter: ${nicheProducts.length} accepted, ${rejected} rejected (off-niche)`);
  }

  // Dedupe by productName, filter excluded, sort by earning potential
  const seen = new Set<string>();
  return nicheProducts
    .filter(p => {
      const key = p.productName.toLowerCase();
      if (seen.has(key) || excluded.has(key)) return false;
      seen.add(key);
      return p.commissionRate >= 0.03 && p.sales >= 10 && p.price > 0 && p.imageUrl;
    })
    .sort((a, b) => (b.commissionRate * b.sales) - (a.commissionRate * a.sales))
    .slice(0, count);
}
