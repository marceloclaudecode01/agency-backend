import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { SocialService } from '../modules/social/social.service';
import { isSafeModeActive, isAgentPaused } from './safe-mode';
import { notificationsService } from '../modules/notifications/notifications.service';

/**
 * Reputation Monitor
 * Monitors: negative feedback, engagement drops, comment sentiment trends
 * Actions: auto-adjust intensity, alert admins, trigger protective measures
 */

const socialService = new SocialService();

interface ReputationSnapshot {
  negativeComments: number;
  totalComments: number;
  engagementTrend: 'UP' | 'STABLE' | 'DOWN' | 'CRITICAL';
  crisisCount: number;
  overallHealth: 'HEALTHY' | 'WARNING' | 'DANGER';
  recommendations: string[];
}

export async function checkReputation(): Promise<ReputationSnapshot> {
  if (await isSafeModeActive() || await isAgentPaused('Reputation Monitor')) {
    return {
      negativeComments: 0, totalComments: 0,
      engagementTrend: 'STABLE', crisisCount: 0,
      overallHealth: 'HEALTHY', recommendations: [],
    };
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 1. Analyze comment sentiment trends (last 24h)
  const recentComments = await prisma.commentLog.findMany({
    where: { createdAt: { gte: oneDayAgo } },
  });

  const negativeComments = recentComments.filter(
    (c) => c.sentiment === 'NEGATIVE' || c.sentiment === 'CRISIS'
  ).length;
  const crisisCount = recentComments.filter((c) => c.sentiment === 'CRISIS').length;
  const totalComments = recentComments.length;

  // 2. Analyze engagement trend (7-day window)
  const recentPerf = await prisma.contentPerformance.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    orderBy: { createdAt: 'asc' },
  });

  let engagementTrend: 'UP' | 'STABLE' | 'DOWN' | 'CRITICAL' = 'STABLE';
  if (recentPerf.length >= 4) {
    const half = Math.floor(recentPerf.length / 2);
    const firstHalf = recentPerf.slice(0, half);
    const secondHalf = recentPerf.slice(half);

    const avgFirst = firstHalf.reduce((s, p) => s + p.engagementScore, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, p) => s + p.engagementScore, 0) / secondHalf.length;

    if (avgSecond > avgFirst * 1.1) engagementTrend = 'UP';
    else if (avgSecond < avgFirst * 0.5) engagementTrend = 'CRITICAL';
    else if (avgSecond < avgFirst * 0.8) engagementTrend = 'DOWN';
  }

  // 3. Check for rejected posts trend (Governor rejecting too many = content quality issue)
  const rejectedToday = await prisma.scheduledPost.count({
    where: {
      governorDecision: 'REJECT',
      governorReviewedAt: { gte: oneDayAgo },
    },
  });

  // 4. Determine overall health
  let overallHealth: 'HEALTHY' | 'WARNING' | 'DANGER' = 'HEALTHY';
  const recommendations: string[] = [];

  const negativePct = totalComments > 0 ? (negativeComments / totalComments) * 100 : 0;

  if (crisisCount >= 2 || engagementTrend === 'CRITICAL') {
    overallHealth = 'DANGER';
  } else if (negativePct > 30 || engagementTrend === 'DOWN' || rejectedToday > 5) {
    overallHealth = 'WARNING';
  }

  // Generate recommendations
  if (negativePct > 30) {
    recommendations.push('Alto índice de comentários negativos — revisar tom e temas dos posts');
  }
  if (engagementTrend === 'CRITICAL') {
    recommendations.push('Queda CRÍTICA de engajamento — reduzir frequência e focar em qualidade');
  } else if (engagementTrend === 'DOWN') {
    recommendations.push('Engajamento em queda — testar novos formatos e horários');
  }
  if (rejectedToday > 5) {
    recommendations.push('Muitos posts rejeitados pelo Governor — Content Creator precisa de calibração');
  }
  if (crisisCount > 0) {
    recommendations.push(`${crisisCount} comentário(s) de CRISE detectados — verificar manualmente`);
  }

  // 5. Save events if concerning
  if (overallHealth !== 'HEALTHY') {
    await prisma.reputationEvent.create({
      data: {
        type: overallHealth === 'DANGER' ? 'ENGAGEMENT_DROP' : 'NEGATIVE_FEEDBACK',
        severity: overallHealth === 'DANGER' ? 'HIGH' : 'MEDIUM',
        details: JSON.stringify({
          negativePct: Math.round(negativePct),
          engagementTrend,
          crisisCount,
          rejectedToday,
          recommendations,
        }),
      },
    });

    // 6. Auto-adjust if DANGER
    if (overallHealth === 'DANGER') {
      try {
        // Reduce posting frequency via SystemConfig
        await prisma.systemConfig.upsert({
          where: { key: 'reputation_throttle' },
          update: { value: { enabled: true, reducedMaxPerDay: 2, reason: 'Reputation DANGER mode', activatedAt: new Date().toISOString() } },
          create: { key: 'reputation_throttle', value: { enabled: true, reducedMaxPerDay: 2, reason: 'Reputation DANGER mode', activatedAt: new Date().toISOString() } },
        });

        await agentLog('Reputation Monitor', '🚨 DANGER: Frequência reduzida para 2 posts/dia automaticamente', { type: 'action' });

        // Notify admins
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        for (const admin of admins) {
          await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'ALERTA: Reputação em perigo', `Engajamento: ${engagementTrend}, Negativos: ${Math.round(negativePct)}%, Crises: ${crisisCount}. Frequência reduzida automaticamente.`);
        }
      } catch {}
    }

    // Clear throttle if back to HEALTHY
  } else {
    try {
      const throttle = await prisma.systemConfig.findUnique({ where: { key: 'reputation_throttle' } });
      if (throttle && (throttle.value as any)?.enabled) {
        await prisma.systemConfig.update({
          where: { key: 'reputation_throttle' },
          data: { value: { enabled: false, clearedAt: new Date().toISOString() } },
        });
        await agentLog('Reputation Monitor', '✅ Reputação normalizada — throttle removido', { type: 'result' });
      }
    } catch {}
  }

  await agentLog('Reputation Monitor', `Saúde: ${overallHealth} | Negativos: ${negativeComments}/${totalComments} | Trend: ${engagementTrend} | Crises: ${crisisCount}`, {
    type: 'info',
    payload: { overallHealth, negativePct: Math.round(negativePct), engagementTrend, crisisCount },
  });

  return {
    negativeComments,
    totalComments,
    engagementTrend,
    crisisCount,
    overallHealth,
    recommendations,
  };
}

export async function getReputationHistory(days: number = 7): Promise<any[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.reputationEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export function startReputationMonitor() {
  // Check every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    try {
      await checkReputation();
    } catch (err: any) {
      console.error('[Reputation] Erro:', err.message);
      await agentLog('Reputation Monitor', `Erro: ${err.message}`, { type: 'error' });
    }
  });
  console.log('[Reputation] Monitor de reputação iniciado (a cada 2h)');
}
