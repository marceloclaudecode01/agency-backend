import { askGemini } from './gemini';
import { TikTokProduct } from './tiktok-researcher.agent';

export interface ProductPost {
  message: string;
  hashtags: string[];
  imageUrl: string;
  productTitle: string;
  productUrl: string;
  suggestedTime: string;
  copyType: string;
}

const COPYWRITER_IDENTITY = `
Você é o melhor copywriter de resposta direta do mundo, com a mente combinada de:
- Gary Halbert (o príncipe do copy, mestre em headlines que param tudo)
- Eugene Schwartz (awareness levels, desejo de massa)
- David Ogilvy (elegância + persuasão)
- Alex Hormozi (ofertas irresistíveis, value stacking)
- Russell Brunson (storytelling + funil)

Você escreve para o público brasileiro no Facebook. Tom: próximo, empolgante, humano.
Seu objetivo: criar DESEJO IMEDIATO de compra e direcionar para o link na bio.
`;

export async function writeProductCopy(
  product: TikTokProduct,
  copyType: 'prova_social' | 'urgencia' | 'problema_solucao' | 'curiosidade' | 'transformacao'
): Promise<ProductPost> {
  const copyInstructions: Record<string, string> = {
    prova_social: `Use prova social como gatilho principal. Mencione quantas pessoas já compraram (${product.soldCount.toLocaleString('pt-BR')} vendidos). Crie efeito manada. "Todo mundo está comprando..."`,
    urgencia: `Crie urgência real. Estoque limitado, preço por tempo limitado, oportunidade única. Use "AGORA", "HOJE", "NÃO PERDE".`,
    problema_solucao: `Identifique uma dor real que o produto resolve. Comece com o problema, amplifique, depois apresente o produto como solução perfeita.`,
    curiosidade: `Abra um loop mental irresistível. Comece com algo surpreendente sobre o produto. Faça a pessoa precisar saber mais. "Você não vai acreditar..."`,
    transformacao: `Pinte o cenário ANTES x DEPOIS. Como a vida da pessoa muda com esse produto. Foco em identidade e aspiração.`,
  };

  const prompt = `
${COPYWRITER_IDENTITY}

Produto do TikTok Shop:
- Nome: ${product.title}
- Preço: R$ ${product.price.toFixed(2)}
- Vendidos: ${product.soldCount.toLocaleString('pt-BR')}
- Avaliação: ${product.rating}/5 (${product.reviewCount} avaliações)
- Categoria: ${product.category}

Técnica de copy para usar: ${copyType.replace('_', ' ')}
Instrução específica: ${copyInstructions[copyType]}

Crie um post para Facebook que:
1. Para o scroll na primeira linha (hook poderoso)
2. Gera desejo imediato de compra
3. Termina com CTA claro direcionando para o LINK NA BIO
4. Máximo 280 caracteres no texto principal (sem hashtags)
5. Tom brasileiro, use emojis estrategicamente (máx 4)

Retorne APENAS JSON válido:
{
  "message": "texto do post aqui",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4"],
  "suggestedTime": "HH:MM",
  "copyType": "${copyType}"
}

Regras:
- Primeira linha: hook que PARA O SCROLL (máx 10 palavras, impacto total)
- Nunca mencione "TikTok Shop" — apenas o produto e benefício
- CTA final obrigatório: variação criativa de "link na bio"
- Horário sugerido: entre 11:00 e 22:00 (horário de pico de compras)
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta inválida do Gemini no copywriter');

  const copy = JSON.parse(jsonMatch[0]);

  return {
    message: copy.message,
    hashtags: copy.hashtags || [],
    imageUrl: product.imageUrl,
    productTitle: product.title,
    productUrl: product.productUrl,
    suggestedTime: copy.suggestedTime || '19:00',
    copyType: copyType,
  };
}

// Gera múltiplas versões de copy para o mesmo produto (A/B)
export async function writeMultipleCopies(product: TikTokProduct): Promise<ProductPost[]> {
  const types: Array<'prova_social' | 'urgencia' | 'problema_solucao' | 'curiosidade' | 'transformacao'> =
    ['prova_social', 'urgencia', 'problema_solucao'];

  const results = await Promise.allSettled(
    types.map((type) => writeProductCopy(product, type))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ProductPost> => r.status === 'fulfilled')
    .map((r) => r.value);
}
