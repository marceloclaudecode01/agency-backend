import prisma from '../config/database';
import { SocialService } from '../modules/social/social.service';
import { agentLog } from './agent-logger';

const AGENT_NAME = 'Performance Collector';
const socialService = new SocialService();

export async function collectPostPerformance(): Promise<void> {
  await agentLog(AGENT_NAME, 'Coletando métricas de engajamento dos posts recentes...', { type: 'action', to: 'Facebook API' });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const publishedPosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { gte: sevenDaysAgo },
      fbPostId: { not: null },
    },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  });

  if (publishedPosts.length === 0) {
    await agentLog(AGENT_NAME, 'Nenhum post publicado nos últimos 7 dias.', { type: 'info' });
    return;
  }

  let collected = 0;

  for (const post of publishedPosts) {
    // Skip if already collected today
    const existing = await prisma.postPerformance.findFirst({
      where: {
        scheduledPostId: post.id,
        collectedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });
    if (existing) continue;

    try {
      const engagement = await socialService.getPostEngagement(post.fbPostId!);
      const total = engagement.likes + engagement.comments + engagement.shares;
      const engagementRate = total > 0 ? total / Math.max(engagement.likes, 1) : 0;

      await prisma.postPerformance.create({
        data: {
          scheduledPostId: post.id,
          platform: 'facebook',
          likes: engagement.likes,
          comments: engagement.comments,
          shares: engagement.shares,
          engagementRate,
        },
      });
      collected++;
    } catch (err: any) {
      await agentLog(AGENT_NAME, `⚠️ Erro ao coletar métricas do post ${post.fbPostId}: ${err.message}`, { type: 'error' });
    }

    // Rate limit: wait 2s between API calls
    await new Promise((r) => setTimeout(r, 2000));
  }

  await agentLog(AGENT_NAME, `✅ Métricas coletadas para ${collected} posts.`, { type: 'result', payload: { collected } });
}

export async function getTopPerformingPosts(limit = 5): Promise<Array<{ topic: string; message: string; likes: number; engagementRate: number }>> {
  const topPosts = await prisma.postPerformance.findMany({
    where: { platform: 'facebook' },
    orderBy: { likes: 'desc' },
    take: limit,
    include: {
      scheduledPost: { select: { topic: true, message: true } },
    },
  });

  return topPosts.map((p) => ({
    topic: p.scheduledPost.topic,
    message: p.scheduledPost.message.substring(0, 100),
    likes: p.likes,
    engagementRate: p.engagementRate,
  }));
}
