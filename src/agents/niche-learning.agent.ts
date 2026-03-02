import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { askGemini } from './gemini';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * Niche Learning Engine
 * - Analyzes audience behavior from engagement data
 * - Builds audience persona insights over time
 * - Feeds insights into content creator for better targeting
 * - Runs Sunday at 05:00
 */

export async function learnFromAudience(): Promise<any> {
  // Gather engagement data
  const performance = await prisma.contentPerformance.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const comments = await prisma.commentLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const topContent = performance
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, 10);

  const sentimentBreakdown = {
    positive: comments.filter((c) => c.sentiment === 'POSITIVE').length,
    neutral: comments.filter((c) => c.sentiment === 'NEUTRAL').length,
    negative: comments.filter((c) => c.sentiment === 'NEGATIVE').length,
  };

  const prompt = `Você é um especialista em análise de audiência digital.

Dados de engajamento:
- Top tópicos: ${topContent.map((p) => `${p.topic} (score: ${p.engagementScore})`).join(', ')}
- Horários top: ${topContent.map((p) => p.publishedHour).filter(Boolean).join(', ')}
- Tipos top: ${topContent.map((p) => p.contentType).filter(Boolean).join(', ')}
- Sentimento: ${JSON.stringify(sentimentBreakdown)}
- Total comentários recentes: ${comments.length}

Gere insights sobre a audiência. Retorne APENAS JSON válido:
{
  "insights": [
    {
      "category": "demographics|behavior|preference|pain_point|desire",
      "insight": "texto do insight",
      "confidence": 0.7
    }
  ]
}`;

  const raw = await askGemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to parse audience insights');

  const data = JSON.parse(match[0]);
  let updated = 0;

  for (const item of (data.insights || []).slice(0, 8)) {
    // Upsert: update if similar insight exists, create otherwise
    const existing = await prisma.audienceInsight.findFirst({
      where: { category: item.category, insight: { contains: item.insight.substring(0, 30) } },
    });

    if (existing) {
      await prisma.audienceInsight.update({
        where: { id: existing.id },
        data: {
          confidence: Math.min(1, existing.confidence + 0.1),
          dataPoints: existing.dataPoints + 1,
          lastUpdated: new Date(),
        },
      });
    } else {
      await prisma.audienceInsight.create({
        data: {
          category: item.category || 'preference',
          insight: item.insight,
          confidence: item.confidence || 0.5,
        },
      });
    }
    updated++;
  }

  return { processed: updated };
}

export async function getAudienceProfile() {
  const insights = await prisma.audienceInsight.findMany({
    orderBy: [{ confidence: 'desc' }, { dataPoints: 'desc' }],
    take: 30,
  });

  const byCategory: Record<string, any[]> = {};
  for (const i of insights) {
    if (!byCategory[i.category]) byCategory[i.category] = [];
    byCategory[i.category].push(i);
  }

  return { insights, byCategory, total: insights.length };
}

export function startNicheLearningAgent() {
  // Sunday at 05:00
  cron.schedule('0 5 * * 0', async () => {
    if (await isSafeModeActive() || await isAgentPaused('Niche Learning')) return;
    try {
      const result = await learnFromAudience();
      await agentLog('Niche Learning', `Audience analysis complete: ${result.processed} insights updated`, { type: 'result' });
    } catch (err: any) {
      await agentLog('Niche Learning', `Error: ${err.message}`, { type: 'error' });
    }
  });
}
