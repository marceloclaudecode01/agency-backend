import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { generatePostFromStrategy } from './content-creator.agent';
import { generateImageForPost } from './image-generator.agent';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * A/B Testing Engine
 * - Generates variant B for each post created by the Autonomous Engine
 * - After 24h, measures engagement and picks the winner
 * - Escalates winners for future strategy learning
 */

// Create variant B for a post (called by Autonomous Engine or manually)
export async function createABVariant(originalPost: {
  id: string;
  topic: string;
  contentType: string | null;
  scheduledFor: Date;
}): Promise<string | null> {
  try {
    // Check if aggressive mode is on for more variants
    let isAggressive = false;
    try {
      const config = await prisma.systemConfig.findUnique({ where: { key: 'aggressive_growth_mode' } });
      isAggressive = config?.value === true || (config?.value as any)?.enabled === true;
    } catch {}

    // Generate variant B with different angle
    const recentPosts = await prisma.scheduledPost.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      select: { topic: true },
    });
    const recentTopics = recentPosts.map((p) => p.topic).filter(Boolean) as string[];

    const variant = await generatePostFromStrategy(
      originalPost.topic + ' (ÂNGULO DIFERENTE — use abordagem oposta: se o original é educativo, seja provocativo; se é lista, seja história)',
      originalPost.contentType || 'educativo',
      recentTopics
    );

    // Generate image for variant
    let imageUrl: string | null = null;
    try {
      const img = await generateImageForPost(originalPost.topic, originalPost.contentType || 'educativo');
      imageUrl = img.url || null;
    } catch {}

    // Schedule variant 5 min after original
    const variantTime = new Date(originalPost.scheduledFor.getTime() + 5 * 60 * 1000);

    const hashtagsStr = variant.hashtags
      ? variant.hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ')
      : null;

    const saved = await prisma.scheduledPost.create({
      data: {
        topic: originalPost.topic,
        message: variant.message,
        hashtags: hashtagsStr,
        imageUrl,
        status: 'PENDING',
        source: 'ab-testing-engine',
        contentType: originalPost.contentType,
        scheduledFor: variantTime,
      },
    });

    // Create AB Test record
    await prisma.aBTest.create({
      data: {
        originalTopic: originalPost.topic,
        variantA: originalPost.id,
        variantB: saved.id,
        status: 'RUNNING',
      },
    });

    // Link both posts to the test
    await prisma.scheduledPost.update({
      where: { id: originalPost.id },
      data: { abTestId: saved.id }, // cross-reference
    });
    await prisma.scheduledPost.update({
      where: { id: saved.id },
      data: { abTestId: originalPost.id },
    });

    await agentLog('A/B Testing', `Variante B criada para "${originalPost.topic}"`, {
      type: 'action',
      payload: { originalId: originalPost.id, variantId: saved.id },
    });

    return saved.id;
  } catch (err: any) {
    await agentLog('A/B Testing', `Erro ao criar variante: ${err.message}`, { type: 'error' });
    return null;
  }
}

// Measure results after 24h and pick winner
export async function measureABTests(): Promise<{ measured: number; winners: string[] }> {
  if (await isSafeModeActive() || await isAgentPaused('A/B Testing')) {
    return { measured: 0, winners: [] };
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const runningTests = await prisma.aBTest.findMany({
    where: {
      status: 'RUNNING',
      createdAt: { lte: cutoff },
    },
  });

  if (runningTests.length === 0) return { measured: 0, winners: [] };

  const winners: string[] = [];

  for (const test of runningTests) {
    try {
      // Get performance data for both variants
      const perfA = await prisma.contentPerformance.findFirst({
        where: { postId: test.variantA },
      });
      const perfB = await prisma.contentPerformance.findFirst({
        where: { postId: test.variantB },
      });

      const scoreA = perfA?.engagementScore ?? 0;
      const scoreB = perfB?.engagementScore ?? 0;

      const winnerId = scoreA >= scoreB ? test.variantA : test.variantB;
      const winnerLabel = scoreA >= scoreB ? 'A' : 'B';
      const margin = Math.abs(scoreA - scoreB);

      await prisma.aBTest.update({
        where: { id: test.id },
        data: {
          status: 'COMPLETED',
          winnerId,
          winnerReason: `Variante ${winnerLabel} venceu (${Math.max(scoreA, scoreB).toFixed(1)} vs ${Math.min(scoreA, scoreB).toFixed(1)}, margem: ${margin.toFixed(1)})`,
          scoreA,
          scoreB,
          measuredAt: new Date(),
        },
      });

      winners.push(winnerId);

      await agentLog('A/B Testing', `Teste "${test.originalTopic}": Variante ${winnerLabel} VENCEU (${scoreA.toFixed(1)} vs ${scoreB.toFixed(1)})`, {
        type: 'result',
        payload: { testId: test.id, winnerId, scoreA, scoreB },
      });
    } catch (err: any) {
      await agentLog('A/B Testing', `Erro ao medir teste ${test.id}: ${err.message}`, { type: 'error' });
    }
  }

  return { measured: runningTests.length, winners };
}

// Get A/B test statistics
export async function getABTestStats(): Promise<{
  running: number;
  completed: number;
  avgImprovement: number;
  recentTests: any[];
}> {
  const running = await prisma.aBTest.count({ where: { status: 'RUNNING' } });
  const completed = await prisma.aBTest.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { measuredAt: 'desc' },
    take: 20,
  });

  let totalImprovement = 0;
  for (const test of completed) {
    const winner = Math.max(test.scoreA, test.scoreB);
    const loser = Math.min(test.scoreA, test.scoreB);
    if (loser > 0) {
      totalImprovement += ((winner - loser) / loser) * 100;
    }
  }

  const avgImprovement = completed.length > 0 ? totalImprovement / completed.length : 0;

  return {
    running,
    completed: completed.length,
    avgImprovement: Math.round(avgImprovement),
    recentTests: completed.slice(0, 10).map((t) => ({
      id: t.id,
      topic: t.originalTopic,
      scoreA: t.scoreA,
      scoreB: t.scoreB,
      winner: t.winnerId === t.variantA ? 'A' : 'B',
      reason: t.winnerReason,
      measuredAt: t.measuredAt,
    })),
  };
}

// Cron: measure tests every 6h
export function startABTestingEngine() {
  cron.schedule('0 */6 * * *', async () => {
    try {
      const result = await measureABTests();
      if (result.measured > 0) {
        await agentLog('A/B Testing', `${result.measured} testes medidos, ${result.winners.length} vencedores identificados`, {
          type: 'result',
        });
      }
    } catch (err: any) {
      console.error('[A/B Testing] Erro:', err.message);
      await agentLog('A/B Testing', `Erro: ${err.message}`, { type: 'error' });
    }
  });
  console.log('[A/B Testing] Engine iniciado (medição a cada 6h)');
}
