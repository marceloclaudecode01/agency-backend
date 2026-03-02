import cron from 'node-cron';
import prisma from '../config/database';
import { askGemini } from './gemini';
import { agentLog } from './agent-logger';
import { isSafeModeActive, isAgentPaused } from './safe-mode';
import { getBrandContext } from './brand-brain.agent';
import { checkCompliance } from './policy-compliance.agent';
import { checkPatternVariation } from './pattern-variation.agent';

interface GovernorDecision {
  decision: 'APPROVE' | 'REJECT' | 'RESCHEDULE' | 'QUEUE_FOR_NEXT_DAY';
  reason: string;
  qualityScore: number;
  newScheduledFor?: Date;
}

interface GovernorContext {
  maxPerDay: number;
  approvedToday: number;
  contentMix: { organic: number; product: number };
  organicToday: number;
  productToday: number;
  approvedTimes: Date[];
  bestHours: string[];
}

function getStartOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function findNextAvailableSlot(scheduledFor: Date, approvedTimes: Date[]): Date | null {
  const minIntervalMs = 2 * 60 * 60 * 1000; // 2 hours
  const sorted = [...approvedTimes].sort((a, b) => a.getTime() - b.getTime());

  // Check if current time has conflict
  const hasConflict = sorted.some(
    (t) => Math.abs(t.getTime() - scheduledFor.getTime()) < minIntervalMs
  );

  if (!hasConflict) return null; // no reschedule needed

  // Find next available slot after the last approved post
  let candidate = new Date(scheduledFor);
  for (const t of sorted) {
    if (Math.abs(candidate.getTime() - t.getTime()) < minIntervalMs) {
      candidate = new Date(t.getTime() + minIntervalMs);
    }
  }

  // Don't schedule past 22:00
  if (candidate.getHours() >= 22) return null;

  return candidate;
}

async function evaluatePost(
  post: any,
  ctx: GovernorContext
): Promise<GovernorDecision> {
  // Rule 1: Daily limit
  if (ctx.approvedToday >= ctx.maxPerDay) {
    return {
      decision: 'QUEUE_FOR_NEXT_DAY',
      reason: `Limite diário atingido (${ctx.maxPerDay} posts/dia)`,
      qualityScore: 0,
    };
  }

  // Rule 2: Content mix balance
  const totalAfter = ctx.approvedToday + 1;
  const type = post.contentType || 'organic';
  const currentCount = type === 'product' ? ctx.productToday : ctx.organicToday;
  const targetPct = type === 'product' ? ctx.contentMix.product : ctx.contentMix.organic;
  const projectedPct = ((currentCount + 1) / totalAfter) * 100;

  if (projectedPct > targetPct + 20) {
    return {
      decision: 'QUEUE_FOR_NEXT_DAY',
      reason: `Mix desbalanceado: ${type} ficaria ${projectedPct.toFixed(0)}% (alvo: ${targetPct}%)`,
      qualityScore: 0,
    };
  }

  // Rule 3: Minimum 2h interval
  const newSlot = findNextAvailableSlot(post.scheduledFor, ctx.approvedTimes);
  if (newSlot === null && ctx.approvedTimes.some(
    (t) => Math.abs(t.getTime() - post.scheduledFor.getTime()) < 2 * 60 * 60 * 1000
  )) {
    // Conflict and no available slot today
    return {
      decision: 'QUEUE_FOR_NEXT_DAY',
      reason: 'Sem slot disponível com intervalo mínimo de 2h hoje',
      qualityScore: 0,
    };
  }

  // Rule 4: LLM quality check + duplicate detection (Phase 2: expanded to 20 posts)
  let qualityScore = 7; // default if LLM fails
  try {
    const recentPosts = await prisma.scheduledPost.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 20,
      select: { topic: true, message: true },
    });

    const recentTopics = recentPosts.map((p) => p.topic).join(', ');
    const brandContext = await getBrandContext();

    const prompt = `Avalie este post para redes sociais de 1 a 10 (qualidade, originalidade, engajamento) e verifique duplicatas.
${brandContext}
Post: "${post.message.substring(0, 300)}"
Tópico: "${post.topic}"
Tópicos recentes publicados (últimos 20): ${recentTopics || 'nenhum'}
Retorne APENAS JSON: { "score": 7, "isDuplicate": false, "reason": "motivo breve" }`;

    const raw = await askGemini(prompt);
    const match = raw.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      qualityScore = Math.max(1, Math.min(10, parsed.score || 7));

      if (parsed.isDuplicate) {
        return {
          decision: 'REJECT',
          reason: `Conteúdo duplicado: ${parsed.reason}`,
          qualityScore,
        };
      }

      if (qualityScore < 4) {
        return {
          decision: 'REJECT',
          reason: `Qualidade baixa (${qualityScore}/10): ${parsed.reason}`,
          qualityScore,
        };
      }
    }
  } catch (err: any) {
    console.log(`[Governor] LLM check falhou, usando score padrão: ${err.message}`);
  }

  // Rule 5: Policy compliance check
  try {
    const compliance = await checkCompliance(post.message, post.platform || 'facebook');
    if (!compliance.compliant && compliance.riskLevel === 'HIGH') {
      return {
        decision: 'REJECT',
        reason: `compliance: ${compliance.issues.join('; ')}`,
        qualityScore,
      };
    }
  } catch {}

  // Rule 6: Pattern variation check
  try {
    const variation = await checkPatternVariation(post.message);
    if (!variation.varied && variation.similarityScore >= 70) {
      qualityScore = Math.max(1, qualityScore - 2);
    }
  } catch {}

  // All checks passed → APPROVE (with possible reschedule)
  if (newSlot) {
    return {
      decision: 'APPROVE',
      reason: `Aprovado e reagendado de ${post.scheduledFor.toTimeString().slice(0, 5)} para ${newSlot.toTimeString().slice(0, 5)} (intervalo 2h)`,
      qualityScore,
      newScheduledFor: newSlot,
    };
  }

  return {
    decision: 'APPROVE',
    reason: `Aprovado (qualidade: ${qualityScore}/10)`,
    qualityScore,
  };
}

export async function reviewPendingPosts(): Promise<void> {
  // Safe mode check — do not approve anything
  if (await isSafeModeActive() || await isAgentPaused('Content Governor')) {
    await agentLog('Content Governor', 'Safe mode ou agente pausado — revisão suspensa', { type: 'info' });
    return;
  }

  // 1. Load current strategy
  const strategy = await prisma.weeklyStrategy.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  let maxPerDay = strategy?.maxPostsPerDay ?? 5;

  // Reputation throttle: reduce max if reputation is in danger
  try {
    const throttle = await prisma.systemConfig.findUnique({ where: { key: 'reputation_throttle' } });
    if (throttle && (throttle.value as any)?.enabled) {
      maxPerDay = Math.min(maxPerDay, (throttle.value as any)?.reducedMaxPerDay ?? 2);
      await agentLog('Content Governor', `Reputation throttle ativo: limite reduzido para ${maxPerDay}/dia`, { type: 'info' });
    }
  } catch {}

  // Aggressive growth mode: increase max
  try {
    const aggConfig = await prisma.systemConfig.findUnique({ where: { key: 'aggressive_growth_mode' } });
    if (aggConfig && ((aggConfig.value as any)?.enabled === true || aggConfig.value === true)) {
      maxPerDay = Math.max(maxPerDay, 8); // aggressive = up to 8/day
    }
  } catch {}
  const contentMix = (strategy?.contentMix as any) ?? { organic: 60, product: 40 };
  const bestHours = (strategy?.bestPostingHours as any) ?? ['10:00', '14:00', '18:00'];

  // Phase 2: Anti-spam — weekly limit (max 30 posts/week)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyApproved = await prisma.scheduledPost.count({
    where: { governorDecision: 'APPROVE', governorReviewedAt: { gte: weekAgo } },
  });
  if (weeklyApproved >= 30) {
    await agentLog('Content Governor', `Limite semanal atingido (30 posts/semana). Revisão suspensa.`, { type: 'info' });
    return;
  }

  // Phase 2: Anti-spam — cooldown after FAILED post (4h)
  const lastFailed = await prisma.scheduledPost.findFirst({
    where: { status: 'FAILED' },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  if (lastFailed && Date.now() - lastFailed.updatedAt.getTime() < 4 * 60 * 60 * 1000) {
    await agentLog('Content Governor', 'Cooldown ativo (post FAILED < 4h). Revisão adiada.', { type: 'info' });
    return;
  }

  // Phase 8: Load active campaigns
  let activeCampaigns: any[] = [];
  try {
    activeCampaigns = await prisma.contentCampaign.findMany({
      where: { status: 'ACTIVE', startDate: { lte: new Date() }, endDate: { gte: new Date() } },
    });
  } catch {}

  // 2. Fetch pending posts not yet reviewed
  const pending = await prisma.scheduledPost.findMany({
    where: { status: 'PENDING', governorDecision: null },
    orderBy: { scheduledFor: 'asc' },
  });

  if (pending.length === 0) return;

  // 3. Count today's already approved posts
  const today = getStartOfDay();
  const todayEnd = getEndOfDay();

  const todayApproved = await prisma.scheduledPost.findMany({
    where: {
      scheduledFor: { gte: today, lte: todayEnd },
      OR: [
        { governorDecision: 'APPROVE' },
        { status: 'PUBLISHED' },
      ],
    },
    select: { scheduledFor: true, contentType: true },
  });

  let approvedToday = todayApproved.length;
  let organicToday = todayApproved.filter((p) => p.contentType !== 'product').length;
  let productToday = todayApproved.filter((p) => p.contentType === 'product').length;
  let approvedTimes = todayApproved.map((p) => p.scheduledFor);

  await agentLog('Content Governor', `Revisando ${pending.length} posts pendentes (${approvedToday}/${maxPerDay} aprovados hoje)`, {
    type: 'action',
    payload: { pending: pending.length, approvedToday, maxPerDay },
  });

  // 4. Review each pending post
  for (const post of pending) {
    const decision = await evaluatePost(post, {
      maxPerDay,
      approvedToday,
      contentMix,
      organicToday,
      productToday,
      approvedTimes,
      bestHours,
    });

    const newStatus = decision.decision === 'APPROVE' ? 'APPROVED' :
                      decision.decision === 'QUEUE_FOR_NEXT_DAY' ? 'PENDING' : 'REJECTED';

    const updateData: any = {
      governorDecision: decision.decision,
      governorReason: decision.reason,
      governorReviewedAt: new Date(),
      qualityScore: decision.qualityScore,
    };

    if (decision.decision === 'APPROVE') {
      updateData.status = 'APPROVED';
      // Phase 2: Anti-spam humanization — ±15min random offset
      const baseTime = decision.newScheduledFor || post.scheduledFor;
      const offsetMs = (Math.random() * 30 - 15) * 60 * 1000; // -15 to +15 min
      const humanizedTime = new Date(baseTime.getTime() + offsetMs);
      updateData.scheduledFor = humanizedTime;
      approvedToday++;
      approvedTimes.push(humanizedTime);
      if (post.contentType === 'product') productToday++;
      else organicToday++;
    } else if (decision.decision === 'REJECT') {
      updateData.status = 'REJECTED';
    } else if (decision.decision === 'QUEUE_FOR_NEXT_DAY') {
      // Move to tomorrow at same time
      const tomorrow = new Date(post.scheduledFor);
      tomorrow.setDate(tomorrow.getDate() + 1);
      updateData.scheduledFor = tomorrow;
      updateData.governorDecision = null; // will be re-reviewed tomorrow
    }

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: updateData,
    });

    await agentLog('Content Governor', `${decision.decision}: "${post.topic}" — ${decision.reason}`, {
      type: 'result',
      payload: {
        postId: post.id,
        decision: decision.decision,
        qualityScore: decision.qualityScore,
        source: post.source,
        contentType: post.contentType,
      },
    });
  }

  await agentLog('Content Governor', `Revisão concluída: ${pending.length} posts processados`, {
    type: 'info',
  });
}

export function startContentGovernor() {
  cron.schedule('*/10 * * * *', async () => {
    try {
      await reviewPendingPosts();
    } catch (err: any) {
      console.error('[Governor] Erro:', err.message);
      await agentLog('Content Governor', `Erro: ${err.message}`, { type: 'error' });
    }
  });
  console.log('[Governor] Content Governor iniciado (a cada 10 minutos)');
}
