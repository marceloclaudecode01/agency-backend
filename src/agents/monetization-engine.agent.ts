import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { askGemini } from './gemini';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * Monetization Engine
 * - Analyzes content performance to suggest monetization opportunities
 * - Manages funnels and offers lifecycle
 * - Generates CTA-optimized content for offers
 */

export async function analyzeFunnelPerformance(): Promise<any> {
  const funnels = await prisma.funnel.findMany({
    where: { status: 'ACTIVE' },
    include: { offers: true },
  });

  const results = [];
  for (const funnel of funnels) {
    const totalImpressions = funnel.offers.reduce((sum, o) => sum + o.impressions, 0);
    const totalConversions = funnel.offers.reduce((sum, o) => sum + o.conversions, 0);
    const totalRevenue = funnel.offers.reduce((sum, o) => sum + o.revenue, 0);
    const conversionRate = totalImpressions > 0 ? (totalConversions / totalImpressions) * 100 : 0;

    await prisma.funnel.update({
      where: { id: funnel.id },
      data: { conversionRate },
    });

    results.push({
      funnelId: funnel.id,
      name: funnel.name,
      impressions: totalImpressions,
      conversions: totalConversions,
      revenue: totalRevenue,
      conversionRate: Math.round(conversionRate * 100) / 100,
      offersCount: funnel.offers.length,
    });
  }

  return results;
}

export async function suggestMonetization(): Promise<any> {
  const topPosts = await prisma.contentPerformance.findMany({
    orderBy: { engagementScore: 'desc' },
    take: 10,
  });

  if (topPosts.length === 0) return { suggestions: [] };

  const topics = topPosts.map((p) => `${p.topic} (engagement: ${p.engagementScore})`).join('\n');

  const prompt = `Baseado nos posts de melhor performance abaixo, sugira 3 oportunidades de monetização (produto digital, serviço, afiliado, etc).

Posts top:
${topics}

Retorne JSON:
{
  "suggestions": [
    { "type": "product|service|affiliate", "name": "nome", "description": "desc", "estimatedRevenue": "R$ X/mês", "effort": "low|medium|high" }
  ]
}`;

  const raw = await askGemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { suggestions: [] };
}

export async function getFunnelStats() {
  const funnels = await prisma.funnel.findMany({
    include: { offers: true },
    orderBy: { createdAt: 'desc' },
  });

  const totalRevenue = await prisma.offer.aggregate({ _sum: { revenue: true } });

  return {
    funnels,
    totalFunnels: funnels.length,
    activeFunnels: funnels.filter((f) => f.status === 'ACTIVE').length,
    totalRevenue: totalRevenue._sum.revenue || 0,
  };
}

export function startMonetizationEngine() {
  // Daily at 11:00
  cron.schedule('0 11 * * *', async () => {
    if (await isSafeModeActive() || await isAgentPaused('Monetization Engine')) return;
    try {
      const results = await analyzeFunnelPerformance();
      await agentLog('Monetization Engine', `Funnel analysis complete: ${results.length} funnels analyzed`, { type: 'result', payload: results });
    } catch (err: any) {
      await agentLog('Monetization Engine', `Error: ${err.message}`, { type: 'error' });
    }
  });
}
