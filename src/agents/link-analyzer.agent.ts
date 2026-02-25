import axios from 'axios';
import { askGemini } from './gemini';

export interface ProductInfo {
  name: string;
  price: string;
  description: string;
  category: string;
  sourceDomain: string;
  highlights: string[];
}

// Extrai texto relevante de uma página HTML
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 4000);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'link';
  }
}

export async function analyzeProductLink(url: string): Promise<ProductInfo> {
  const domain = extractDomain(url);
  let pageText = '';

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
    });
    pageText = extractTextFromHtml(response.data);
  } catch {
    // Se não conseguir acessar, usa só o domínio como contexto
    pageText = `Produto disponível em ${domain}`;
  }

  const prompt = `
Você é um especialista em análise de produtos para marketing digital.

URL do produto: ${url}
Domínio: ${domain}
Conteúdo da página (pode estar incompleto):
---
${pageText}
---

Com base nessas informações, extraia os dados do produto.
Se não conseguir identificar algum campo, faça uma estimativa inteligente baseada no domínio e contexto.

Retorne APENAS JSON válido:
{
  "name": "nome do produto",
  "price": "preço com moeda (ex: R$ 49,90) ou 'Consulte o link'",
  "description": "descrição do produto em 1-2 frases",
  "category": "categoria do produto (ex: Beleza, Moda, Casa, Tecnologia, Alimentos, etc)",
  "highlights": ["benefício 1", "benefício 2", "benefício 3"]
}

Regras:
- name: nome limpo e comercial, sem códigos
- highlights: 3 pontos fortes do produto que geram desejo de compra
- Se for TikTok Shop, Shopee, Amazon, Mercado Livre — use o contexto do domínio para inferir o tipo de produto
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
    sourceDomain: domain,
    highlights: info.highlights || [],
  };
}
