import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { askGemini } from './gemini';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * Strategic Command AI
 * - Generates monthly strategic plans based on all system data
 * - Considers performance, audience, market intel, and goals
 * - Runs 1st of each month at 03:00
 */

export async function generateStrategicPlan(): Promise<any> {
  // Gather intelligence
  const recentPerformance = await prisma.contentPerformance.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const avgEngagement = recentPerformance.length > 0
    ? recentPerformance.reduce((s, p) => s + p.engagementScore, 0) / recentPerformance.length
    : 0;

  const topTopics = recentPerformance
    .filter((p) => p.topic)
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, 5)
    .map((p) => p.topic);

  const marketIntel = await prisma.marketIntel.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const audienceInsights = await prisma.audienceInsight.findMany({
    orderBy: { confidence: 'desc' },
    take: 10,
  });

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const prompt = `Você é um diretor de marketing estratégico. Crie um plano estratégico mensal.

Dados:
- Engagement médio: ${avgEngagement.toFixed(1)}
- Tópicos top: ${topTopics.join(', ') || 'N/A'}
- Intel de mercado: ${marketIntel.map((m) => m.title).join(', ') || 'N/A'}
- Insights de audiência: ${audienceInsights.map((a) => a.insight).join('; ') || 'N/A'}
- Período: ${period}

Retorne APENAS JSON válido:
{
  "goals": [{ "metric": "string", "target": "string", "priority": "high|medium|low" }],
  "tactics": [{ "name": "string", "description": "string", "channel": "string", "frequency": "string" }],
  "kpis": [{ "name": "string", "current": "string", "target": "string" }],
  "budgetAlloc": { "organic": 60, "paid": 25, "tools": 15 }
}`;

  const raw = await askGemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to parse strategic plan');

  const plan = JSON.parse(match[0]);

  // Supersede previous plans
  await prisma.strategicPlan.updateMany({
    where: { status: 'ACTIVE' },
    data: { status: 'SUPERSEDED' },
  });

  const saved = await prisma.strategicPlan.create({
    data: {
      period,
      goals: plan.goals || [],
      tactics: plan.tactics || [],
      kpis: plan.kpis || [],
      budgetAlloc: plan.budgetAlloc || null,
      status: 'ACTIVE',
    },
  });

  return saved;
}

export async function getCurrentPlan() {
  return prisma.strategicPlan.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
}

export function startStrategicCommandAgent() {
  // 1st of each month at 03:00
  cron.schedule('0 3 1 * *', async () => {
    if (await isSafeModeActive() || await isAgentPaused('Strategic Command')) return;
    try {
      const plan = await generateStrategicPlan();
      await agentLog('Strategic Command', `Monthly plan generated for ${plan.period}`, { type: 'result' });
    } catch (err: any) {
      await agentLog('Strategic Command', `Error: ${err.message}`, { type: 'error' });
    }
  });
}
