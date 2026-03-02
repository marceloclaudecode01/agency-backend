import cron from 'node-cron';
import prisma from '../config/database';
import { askGemini } from './gemini';
import { agentLog } from './agent-logger';

export interface WeeklyStrategyData {
  maxPostsPerDay: number;
  contentMix: { organic: number; product: number };
  bestPostingHours: string[];
  adjustmentReason: string;
}

export async function generateWeeklyStrategy(): Promise<WeeklyStrategyData> {
  await agentLog('Growth Director', 'Iniciando análise semanal de estratégia', { type: 'action' });

  // 1. Get last 7 days of metrics
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const reports = await prisma.metricsReport.findMany({
    where: { createdAt: { gte: weekAgo } },
    orderBy: { createdAt: 'desc' },
  });

  // 2. Get published posts breakdown
  const recentPosts = await prisma.scheduledPost.findMany({
    where: { status: 'PUBLISHED', publishedAt: { gte: weekAgo } },
    select: { contentType: true, publishedAt: true, topic: true, qualityScore: true },
  });

  const organicCount = recentPosts.filter((p) => p.contentType !== 'product').length;
  const productCount = recentPosts.filter((p) => p.contentType === 'product').length;
  const avgQuality = recentPosts.filter((p) => p.qualityScore).length > 0
    ? recentPosts.filter((p) => p.qualityScore).reduce((s, p) => s + (p.qualityScore || 0), 0) /
      recentPosts.filter((p) => p.qualityScore).length
    : 0;

  // 3. Get current strategy for comparison
  const currentStrategy = await prisma.weeklyStrategy.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  // 4. LLM analysis
  const metricsContext = reports.length > 0
    ? reports.map((r) => `Score: ${r.growthScore}/10 — ${r.summary}`).join('\n')
    : 'Nenhuma métrica disponível esta semana.';

  const prompt = `Você é um Growth Director focado em CRESCIMENTO ACELERADO de página no Facebook.

OBJETIVO PRINCIPAL: Aumentar seguidores reais, alcance orgânico, engajamento e autoridade.

REGRAS:
- Priorizar conteúdo de alto valor (educativo, engajamento, autoridade)
- NÃO produzir conteúdo sobre filmes, séries, streaming ou entretenimento genérico
- Qualidade > Quantidade sempre
- Distribuição ideal: 40% educativo, 30% engajamento, 20% autoridade, 10% bastidores

MÉTRICAS DA SEMANA:
${metricsContext}

POSTS PUBLICADOS: ${recentPosts.length} total (${organicCount} orgânicos, ${productCount} produtos)
QUALIDADE MÉDIA: ${avgQuality.toFixed(1)}/10

ESTRATÉGIA ATUAL: ${currentStrategy ? `${currentStrategy.maxPostsPerDay} posts/dia, mix: ${JSON.stringify(currentStrategy.contentMix)}` : 'Nenhuma definida (padrão 3/dia, 80/20)'}

Regras:
- maxPostsPerDay: entre 2 e 4 (qualidade > quantidade)
- contentMix: organic deve ser >= 70 (foco em conteúdo de valor, não produto)
- bestPostingHours: 3 a 5 horários entre 08:00 e 22:00, priorizando picos de engajamento
- Se alcance caiu, MELHORAR qualidade dos posts (não aumentar quantidade)
- Se engajamento alto, manter a fórmula e variar formatos
- Formatos prioritários: listas, perguntas, dicas práticas, curiosidades

Retorne APENAS JSON:
{
  "maxPostsPerDay": 3,
  "contentMix": { "organic": 80, "product": 20 },
  "bestPostingHours": ["09:00", "14:00", "19:00"],
  "adjustmentReason": "razão breve do ajuste focando crescimento"
}`;

  const raw = await askGemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Growth Director: resposta LLM inválida');

  const json = JSON.parse(match[0]);

  // Validate and clamp
  const result: WeeklyStrategyData = {
    maxPostsPerDay: Math.max(3, Math.min(7, json.maxPostsPerDay || 5)),
    contentMix: {
      organic: Math.max(20, Math.min(80, json.contentMix?.organic || 60)),
      product: Math.max(20, Math.min(80, json.contentMix?.product || 40)),
    },
    bestPostingHours: (json.bestPostingHours || ['10:00', '14:00', '18:00']).slice(0, 5),
    adjustmentReason: json.adjustmentReason || 'Ajuste automático baseado em métricas',
  };

  // Ensure mix sums to 100
  const total = result.contentMix.organic + result.contentMix.product;
  if (total !== 100) {
    result.contentMix.organic = Math.round((result.contentMix.organic / total) * 100);
    result.contentMix.product = 100 - result.contentMix.organic;
  }

  // 5. Save new WeeklyStrategy
  const nextMonday = new Date();
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  nextMonday.setHours(0, 0, 0, 0);

  await prisma.weeklyStrategy.create({
    data: {
      weekStart: nextMonday,
      maxPostsPerDay: result.maxPostsPerDay,
      contentMix: result.contentMix,
      bestPostingHours: result.bestPostingHours,
      adjustmentReason: result.adjustmentReason,
    },
  });

  await agentLog('Growth Director', `Estratégia semanal definida: ${result.maxPostsPerDay} posts/dia, mix ${result.contentMix.organic}/${result.contentMix.product}, motivo: ${result.adjustmentReason}`, {
    type: 'result',
    payload: result,
  });

  return result;
}

export function startGrowthDirector() {
  cron.schedule('0 22 * * 0', async () => {
    try {
      await generateWeeklyStrategy();
    } catch (err: any) {
      console.error('[GrowthDirector] Erro:', err.message);
      await agentLog('Growth Director', `Erro: ${err.message}`, { type: 'error' });
    }
  });
  console.log('[GrowthDirector] Growth Director iniciado (Domingos 22:00)');
}
