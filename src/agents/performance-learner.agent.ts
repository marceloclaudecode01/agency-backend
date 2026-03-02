import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { SocialService } from '../modules/social/social.service';

const socialService = new SocialService();

export async function learnFromPerformance(): Promise<{ analyzed: number; saved: number }> {
  await agentLog('Performance Learner', 'Analisando performance dos posts recentes...', { type: 'action' });

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Get published posts from last 48h that haven't been analyzed
  const publishedPosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { gte: twoDaysAgo },
      metaPostId: { not: null },
    },
    select: { id: true, metaPostId: true, contentType: true, topic: true, publishedAt: true },
  });

  // Filter out already analyzed
  const existingIds = await prisma.contentPerformance.findMany({
    where: { postId: { in: publishedPosts.map((p) => p.id) } },
    select: { postId: true },
  });
  const analyzedSet = new Set(existingIds.map((e) => e.postId));
  const toAnalyze = publishedPosts.filter((p) => !analyzedSet.has(p.id));

  if (toAnalyze.length === 0) {
    await agentLog('Performance Learner', 'Nenhum post novo para analisar.', { type: 'info' });
    return { analyzed: 0, saved: 0 };
  }

  let saved = 0;

  for (const post of toAnalyze) {
    try {
      // Fetch engagement from Facebook
      let likes = 0, comments = 0, shares = 0;
      try {
        const fbComments = await socialService.getPostComments(post.metaPostId!);
        comments = fbComments.length;
        // Likes and shares from post insights if available
        // For now use comments as primary metric
      } catch {
        // API may fail for some posts
      }

      const engagementScore = likes * 1 + comments * 3 + shares * 5;
      const publishedHour = post.publishedAt ? new Date(post.publishedAt).getHours() : null;

      await prisma.contentPerformance.create({
        data: {
          postId: post.id,
          likes,
          comments,
          shares,
          engagementScore,
          contentType: post.contentType,
          topic: post.topic,
          publishedHour,
        },
      });
      saved++;
    } catch (err: any) {
      await agentLog('Performance Learner', `Erro ao analisar post ${post.id}: ${err.message}`, { type: 'error' });
    }
  }

  await agentLog('Performance Learner', `Análise concluída: ${toAnalyze.length} posts analisados, ${saved} registros salvos`, {
    type: 'result',
    payload: { analyzed: toAnalyze.length, saved },
  });

  return { analyzed: toAnalyze.length, saved };
}

// Phase 9: Get top performing content types/topics for ROI intelligence
export async function getPerformanceInsights(): Promise<{
  topContentTypes: { contentType: string; avgScore: number }[];
  topHours: { hour: number; avgScore: number }[];
  topTopics: { topic: string; avgScore: number }[];
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const allPerf = await prisma.contentPerformance.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
  });

  // Group by contentType
  const byType = new Map<string, number[]>();
  const byHour = new Map<number, number[]>();
  const byTopic = new Map<string, number[]>();

  for (const p of allPerf) {
    const ct = p.contentType || 'organic';
    if (!byType.has(ct)) byType.set(ct, []);
    byType.get(ct)!.push(p.engagementScore);

    if (p.publishedHour !== null) {
      if (!byHour.has(p.publishedHour)) byHour.set(p.publishedHour, []);
      byHour.get(p.publishedHour)!.push(p.engagementScore);
    }

    if (p.topic) {
      if (!byTopic.has(p.topic)) byTopic.set(p.topic, []);
      byTopic.get(p.topic)!.push(p.engagementScore);
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    topContentTypes: Array.from(byType.entries()).map(([contentType, scores]) => ({ contentType, avgScore: avg(scores) })).sort((a, b) => b.avgScore - a.avgScore),
    topHours: Array.from(byHour.entries()).map(([hour, scores]) => ({ hour, avgScore: avg(scores) })).sort((a, b) => b.avgScore - a.avgScore),
    topTopics: Array.from(byTopic.entries()).map(([topic, scores]) => ({ topic, avgScore: avg(scores) })).sort((a, b) => b.avgScore - a.avgScore).slice(0, 10),
  };
}

export function startPerformanceLearner() {
  cron.schedule('0 23 * * *', async () => {
    try {
      await learnFromPerformance();
    } catch (err: any) {
      console.error('[Learner] Erro:', err.message);
      await agentLog('Performance Learner', `Erro: ${err.message}`, { type: 'error' });
    }
  });
  console.log('[Learner] Performance Learner iniciado (diário 23:00)');
}
