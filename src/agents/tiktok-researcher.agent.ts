import axios from 'axios';

const SCRAPECREATORS_API = 'https://api.scrapecreators.com/v1/tiktok/shop/search';

export interface TikTokProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  soldCount: number;
  imageUrl: string;
  productUrl: string;
  category: string;
  rating: number;
  reviewCount: number;
}

export async function fetchTrendingProducts(
  query: string = 'trending brasil',
  amount: number = 20
): Promise<TikTokProduct[]> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) throw new Error('SCRAPECREATORS_API_KEY não configurada');

  const response = await axios.get(SCRAPECREATORS_API, {
    params: { query, amount },
    headers: { 'x-api-key': apiKey },
    timeout: 15000,
  });

  const raw = response.data?.data || response.data?.products || response.data || [];
  const items = Array.isArray(raw) ? raw : [];

  return items
    .filter((p: any) => p.image?.url_list?.[0] || p.image_url || p.cover_image)
    .map((p: any) => ({
      id: p.product_id || p.id || String(Math.random()),
      title: p.title || p.name || 'Produto',
      price: parseFloat(p.price?.amount || p.price || '0'),
      currency: p.price?.currency || 'BRL',
      soldCount: parseInt(p.sold_count || p.sales || '0', 10),
      imageUrl: p.image?.url_list?.[0] || p.image_url || p.cover_image || '',
      productUrl: p.product_url || p.url || '',
      category: p.category_list?.[0]?.name || p.category || 'Geral',
      rating: parseFloat(p.rating || '0'),
      reviewCount: parseInt(p.review_count || '0', 10),
    }))
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 10);
}

export async function fetchProductsByCategory(category: string): Promise<TikTokProduct[]> {
  return fetchTrendingProducts(category, 15);
}

// Busca produtos em múltiplas categorias e retorna os melhores
export async function fetchBestProducts(): Promise<TikTokProduct[]> {
  const queries = ['mais vendidos brasil', 'trending compras', 'produto viral'];

  const results = await Promise.allSettled(
    queries.map((q) => fetchTrendingProducts(q, 10))
  );

  const all: TikTokProduct[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  // Remove duplicatas por id e ordena por vendas
  const unique = Array.from(new Map(all.map((p) => [p.id, p])).values());
  return unique.sort((a, b) => b.soldCount - a.soldCount).slice(0, 10);
}
