import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { askGemini } from './gemini';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * Market Intelligence Agent
 * - Gathers competitor and market trend data
 * - Identifies opportunities and threats
 * - Runs Wed + Sat at 04:00
 */

export async function gatherMarketIntel(): Promise<any> {
  const brandConfig = await prisma.brandConfig.findMany();
  const niche = brandConfig.find((c) => c.key === 'niche')?.value || 'marketing digital';
  const competitors = brandConfig.find((c) => c.key === 'competitors')?.value || '';

  const prompt = `Você é um analista de inteligência de mercado para o nicho: "${niche}".
${competitors ? `Concorrentes conhecidos: ${competitors}` : ''}

Analise tendências atuais e gere insights acionáveis.

Retorne APENAS JSON válido:
{
  "insights": [
    {
      "type": "competitor|trend|opportunity|threat",
      "title": "título curto",
      "summary": "resumo em 2 frases",
      "relevance": 8,
      "actionable": "ação recomendada"
    }
  ]
}`;

  const raw = await askGemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to parse market intel');

  const data = JSON.parse(match[0]);
  const saved = [];

  for (const insight of (data.insights || []).slice(0, 5)) {
    const record = await prisma.marketIntel.create({
      data: {
        type: insight.type || 'trend',
        title: insight.title,
        summary: insight.summary,
        details: { actionable: insight.actionable },
        source: 'ai_analysis',
        relevance: Math.min(10, Math.max(1, insight.relevance || 5)),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    saved.push(record);
  }

  return { created: saved.length, insights: saved };
}

export async function getMarketInsights(type?: string) {
  const where: any = {};
  if (type) where.type = type;
  // Only non-expired
  where.OR = [{ expiresAt: null }, { expiresAt: { gte: new Date() } }];

  return prisma.marketIntel.findMany({
    where,
    orderBy: { relevance: 'desc' },
    take: 50,
  });
}

export function startMarketIntelligenceAgent() {
  // Wed + Sat at 04:00
  cron.schedule('0 4 * * 3,6', async () => {
    if (await isSafeModeActive() || await isAgentPaused('Market Intelligence')) return;
    try {
      const result = await gatherMarketIntel();
      await agentLog('Market Intelligence', `${result.created} new insights gathered`, { type: 'result' });
    } catch (err: any) {
      await agentLog('Market Intelligence', `Error: ${err.message}`, { type: 'error' });
    }
  });
}
