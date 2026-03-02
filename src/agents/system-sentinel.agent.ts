import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { activateSafeMode, isSafeModeActive, isAgentPaused, pauseAgent } from './safe-mode';
import { checkFacebookToken } from './token-monitor.agent';
import { notificationsService } from '../modules/notifications/notifications.service';

interface SentinelReport {
  apiErrors: number;
  failedPosts: number;
  tokenValid: boolean;
  growthDrop: boolean;
  loopDetected: string[];
  safeModeTriggered: boolean;
  reason?: string;
}

async function runSentinelCheck(): Promise<SentinelReport> {
  const report: SentinelReport = {
    apiErrors: 0,
    failedPosts: 0,
    tokenValid: true,
    growthDrop: false,
    loopDetected: [],
    safeModeTriggered: false,
  };

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 1. Count API errors in last 30min
  const errorLogs = await prisma.agentLog.count({
    where: { type: 'error', createdAt: { gte: thirtyMinAgo } },
  });
  report.apiErrors = errorLogs;

  // 2. Count FAILED posts in last 24h
  const failedPosts = await prisma.scheduledPost.count({
    where: { status: 'FAILED', updatedAt: { gte: twentyFourHoursAgo } },
  });
  report.failedPosts = failedPosts;

  // 3. Check consecutive FAILED posts
  const recentPosts = await prisma.scheduledPost.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { status: true },
  });
  const consecutiveFailed = recentPosts.findIndex((p) => p.status !== 'FAILED');
  const consecutiveFailedCount = consecutiveFailed === -1 ? recentPosts.length : consecutiveFailed;

  // 4. Check Facebook token
  try {
    const tokenStatus = await checkFacebookToken();
    report.tokenValid = tokenStatus.isValid;
  } catch {
    report.tokenValid = false;
  }

  // 5. Check growth score drop >50%
  const recentMetrics = await prisma.metricsReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { growthScore: true },
  });
  if (recentMetrics.length >= 2) {
    const current = recentMetrics[0].growthScore;
    const previous = recentMetrics[1].growthScore;
    if (previous > 0 && current < previous * 0.5) {
      report.growthDrop = true;
    }
  }

  // 6. Phase 7: Loop detection — agent with >50 entries in 30min
  const agentCounts = await prisma.agentLog.groupBy({
    by: ['from'],
    where: { createdAt: { gte: thirtyMinAgo } },
    _count: { id: true },
  });
  for (const ac of agentCounts) {
    if (ac._count.id > 50) {
      report.loopDetected.push(ac.from);
      await pauseAgent(ac.from);
      await agentLog('System Sentinel', `Loop detectado: ${ac.from} com ${ac._count.id} logs em 30min — agente pausado`, { type: 'error' });
    }
  }

  // 7. Phase 7: Governor approve+reject same post >3x
  const governorFlips = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id", COUNT(*) as flip_count FROM "scheduled_posts"
    WHERE "governorReviewedAt" > NOW() - INTERVAL '24 hours'
    AND "governorDecision" IS NOT NULL
    GROUP BY "id"
    HAVING COUNT(*) > 3
    LIMIT 5
  `).catch(() => []);
  if (governorFlips.length > 0) {
    await agentLog('System Sentinel', `Governor flip-flop detectado em ${governorFlips.length} posts`, { type: 'error' });
  }

  // Determine if safe mode should activate
  let reason: string | undefined;

  if (report.apiErrors >= 5) {
    reason = `${report.apiErrors} erros de API em 30min`;
  } else if (consecutiveFailedCount >= 3) {
    reason = `${consecutiveFailedCount} posts FAILED consecutivos`;
  } else if (!report.tokenValid) {
    reason = 'Token Facebook inválido';
  }

  if (reason) {
    const alreadySafe = await isSafeModeActive();
    if (!alreadySafe) {
      await activateSafeMode(reason);
      report.safeModeTriggered = true;
      report.reason = reason;

      // Notify admins
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'SAFE MODE ATIVADO', `Sistema em modo seguro: ${reason}. Publicações pausadas.`);
      }
    }
  }

  // Growth drop alert (not safe mode)
  if (report.growthDrop) {
    await agentLog('System Sentinel', 'Queda de growthScore >50% detectada — alerta enviado', { type: 'error' });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'Alerta: Queda de Growth Score', 'O score de crescimento caiu mais de 50%. Verifique a estratégia.');
    }
  }

  return report;
}

export async function runSentinel(): Promise<SentinelReport> {
  await agentLog('System Sentinel', 'Verificação de saúde do sistema...', { type: 'action' });
  const report = await runSentinelCheck();

  const status = report.safeModeTriggered ? 'SAFE MODE ATIVADO' : 'OK';
  await agentLog('System Sentinel', `Check: ${status} | Erros: ${report.apiErrors} | Failed: ${report.failedPosts} | Token: ${report.tokenValid ? 'OK' : 'INVALID'} | Loops: ${report.loopDetected.length}`, {
    type: report.safeModeTriggered ? 'error' : 'info',
    payload: report,
  });

  return report;
}

export function startSystemSentinel() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runSentinel();
    } catch (err: any) {
      console.error('[Sentinel] Erro:', err.message);
      await agentLog('System Sentinel', `Erro: ${err.message}`, { type: 'error' });
    }
  });
  console.log('[Sentinel] System Sentinel iniciado (a cada 5 minutos)');
}
