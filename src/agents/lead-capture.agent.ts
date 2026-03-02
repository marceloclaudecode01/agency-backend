import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { askGemini } from './gemini';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * Lead Capture Agent
 * - Scans recent comments for buying intent signals
 * - Creates leads automatically from high-intent interactions
 * - Scores leads based on engagement history
 */

const BUYING_SIGNALS = [
  'quanto custa', 'preço', 'como comprar', 'onde compro', 'tem desconto',
  'quero', 'preciso', 'me manda', 'envia', 'entrega', 'parcela',
  'pix', 'cartão', 'link', 'comprar', 'adquirir', 'interessado',
];

export async function scanForLeads(): Promise<{ found: number; created: number }> {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const comments = await prisma.commentLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  let created = 0;
  for (const comment of comments) {
    const text = (comment.reply || '').toLowerCase();
    const hasSignal = BUYING_SIGNALS.some((s) => text.includes(s));
    if (!hasSignal) continue;

    const existing = await prisma.lead.findFirst({ where: { sourceId: comment.commentId } });
    if (existing) continue;

    try {
      const scorePrompt = `Analise este comentário e dê uma nota de 1-100 para intenção de compra. Responda APENAS o número.\n\nComentário: "${comment.reply}"`;
      const scoreRaw = await askGemini(scorePrompt);
      const score = Math.min(100, Math.max(0, parseInt(scoreRaw.trim()) || 30));

      await prisma.lead.create({
        data: {
          name: `Lead #${comment.commentId.slice(-6)}`,
          source: 'comment',
          sourceId: comment.commentId,
          stage: score >= 70 ? 'QUALIFIED' : 'NEW',
          score,
          notes: `Auto-captured from comment. Signal detected in: "${text.substring(0, 100)}"`,
        },
      });
      created++;
    } catch (err: any) {
      console.error('[LeadCapture] Error scoring lead:', err.message);
    }
  }

  return { found: comments.length, created };
}

export async function getLeadPipeline() {
  const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST'];
  const pipeline: Record<string, any[]> = {};

  for (const stage of stages) {
    pipeline[stage] = await prisma.lead.findMany({
      where: { stage },
      orderBy: { score: 'desc' },
      take: 50,
      include: { interactions: { take: 3, orderBy: { createdAt: 'desc' } } },
    });
  }

  return pipeline;
}

export async function updateLeadStage(leadId: string, stage: string) {
  return prisma.lead.update({
    where: { id: leadId },
    data: { stage, lastContact: new Date() },
  });
}

export async function addLeadInteraction(leadId: string, type: string, content: string, direction = 'OUTBOUND') {
  const interaction = await prisma.leadInteraction.create({
    data: { leadId, type, content, direction },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastContact: new Date() },
  });
  return interaction;
}

export function startLeadCaptureAgent() {
  // Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    if (await isSafeModeActive() || await isAgentPaused('Lead Capture')) return;
    try {
      const result = await scanForLeads();
      if (result.created > 0) {
        await agentLog('Lead Capture', `Scan complete: ${result.created} new leads from ${result.found} comments`, { type: 'result' });
      }
    } catch (err: any) {
      await agentLog('Lead Capture', `Error: ${err.message}`, { type: 'error' });
    }
  });
}
