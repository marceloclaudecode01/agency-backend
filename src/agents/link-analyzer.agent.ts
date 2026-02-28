import axios from 'axios';
import { askGemini } from './gemini';

export interface ProductInfo {
  name: string;
  price: string;
  description: string;
  category: string;
  sourceDomain: string;
  highlights: string[];
  imageUrl?: string;
}

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'link';
  }
}

function extractImageFromHtml(html: string): string | undefined {
  // og:image
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage) return ogImage[1];
  // twitter:image
  const twitterImage = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (twitterImage) return twitterImage[1];
  return undefined;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

export async function analyzeProductLink(url: string): Promise<ProductInfo> {
  let finalUrl = url;
  let pageText = '';
  let imageUrl: string | undefined;
  const domain = extractDomain(url);

  try {
    // Resolve redirects (links curtos vt.tiktok.com, etc.)
    const response = await axios.get(url, {
      timeout: 15000,
      headers: BROWSER_HEADERS,
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
    });

    finalUrl = response.request?.res?.responseUrl || response.config?.url || url;
    const html = typeof response.data === 'string' ? response.data : '';
    pageText = extractTextFromHtml(html);
    imageUrl = extractImageFromHtml(html);
  } catch (err: any) {
    console.warn('[LinkAnalyzer] Erro ao acessar URL:', err.message);
    pageText = `Produto disponível em ${domain}`;
  }

  const finalDomain = extractDomain(finalUrl);

  const prompt = `
Você é um especialista em análise de produtos para marketing digital.

URL original: ${url}
URL final (após redirect): ${finalUrl}
Domínio: ${finalDomain}
Conteúdo da página:
---
${pageText}
---

Analise as informações e extraia os dados do produto.
Se for um link do TikTok Shop (tiktok.com/shop), Shopee, Amazon, Mercado Livre, AliExpress — use o contexto para inferir o produto.
Se não conseguir identificar um campo, faça uma estimativa inteligente.

Retorne APENAS JSON válido:
{
  "name": "nome comercial e atrativo do produto",
  "price": "preço com moeda (ex: R$ 49,90) ou 'Consulte o link'",
  "description": "descrição do produto em 1-2 frases persuasivas",
  "category": "categoria (Beleza, Moda, Casa, Tecnologia, Fitness, Alimentos, etc)",
  "highlights": ["benefício ou diferencial 1", "benefício 2", "benefício 3"]
}

Regras:
- name: nome limpo, sem códigos ou IDs
- highlights: 3 pontos que geram desejo de compra
- description: foco em benefício, não em características técnicas
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Não foi possível analisar o produto');

  const info = JSON.parse(jsonMatch[0]);
  return {
    name: info.name || 'Produto',
    price: info.price || 'Consulte o link',
    description: info.description || '',
    category: info.category || 'Geral',
    sourceDomain: finalDomain,
    highlights: info.highlights || [],
    imageUrl,
  };
}
