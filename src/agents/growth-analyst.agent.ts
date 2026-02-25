import { askGemini } from './gemini';
import prisma from '../config/database';

export interface GrowthInsights {
  bestPerformingType: string;
  bestPostingHours: string[];
  audienceProfile: string;
  contentMix: {
    entertainment: number;
    product: number;
    engagement: number;
  };
  topRecommendations: string[];
  confidenceScore: number;
}

const ANALYST_IDENTITY = `
Você é o melhor growth hacker e analista de mídias sociais do mundo, com a mente combinada de:
- Neil Patel (SEO + growth, dados transformados em ação)
- Andrew Chen (growth loops, viral mechanics)
- Alex Schultz (VP Growth do Facebook/Meta — sabe exatamente como o algoritmo funciona)
- Morgan Brown (growth hacking sistemático)

Você analisa dados de performance e traduz em estratégia acionável imediata.
Foco: maximizar alcance orgânico, engajamento e conversão para link na bio.
`;

export async function analyzePageGrowth(): Promise<GrowthInsights> {
  // Busca dados dos últimos 30 dias
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentPosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });

  const lastMetrics = await prisma.metricsReport.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  const totalPosts = recentPosts.length;
  const postsByHour: Record<number, number> = {};
  const topicFrequency: Record<string, number> = {};

  for (const post of recentPosts) {
    if (post.publishedAt) {
      const hour = new Date(post.publishedAt).getHours();
      postsByHour[hour] = (postsByHour[hour] || 0) + 1;
    }
    if (post.topic) {
      topicFrequency[post.topic] = (topicFrequency[post.topic] || 0) + 1;
    }
  }

  const metricsContext = lastMetrics
    ? `Score de crescimento: ${lastMetrics.growthScore}/10
Resumo: ${lastMetrics.summary}
Destaques: ${JSON.stringify(lastMetrics.highlights)}
Recomendações anteriores: ${JSON.stringify(lastMetrics.recommendations)}
Melhores horários anteriores: ${JSON.stringify(lastMetrics.bestPostingTimes)}`
    : 'Sem relatório de métricas ainda.';

  const prompt = `
${ANALYST_IDENTITY}

Dados da página nos últimos 30 dias:
- Total de posts publicados: ${totalPosts}
- Distribuição por hora: ${JSON.stringify(postsByHour)}
- Temas mais usados: ${JSON.stringify(topicFrequency)}

${metricsContext}

Com base nesses dados, faça uma análise de growth e retorne APENAS JSON válido:
{
  "bestPerformingType": "tipo de conteúdo que performa melhor (entretenimento/produto/engajamento)",
  "bestPostingHours": ["HH:MM", "HH:MM", "HH:MM"],
  "audienceProfile": "perfil do público em 1 frase (quem são, o que querem)",
  "contentMix": {
    "entertainment": 40,
    "product": 40,
    "engagement": 20
  },
  "topRecommendations": [
    "recomendação acionável 1",
    "recomendação acionável 2",
    "recomendação acionável 3"
  ],
  "confidenceScore": 7
}

Regras:
- contentMix: percentuais que somam 100, baseado no que converte melhor para link na bio
- bestPostingHours: 3 horários de pico para o público brasileiro
- confidenceScore: 1-10, baseado na quantidade de dados disponíveis
- topRecommendations: ações ESPECÍFICAS e IMEDIATAS, não genéricas
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta inválida do Gemini no analista');

  return JSON.parse(jsonMatch[0]);
}
