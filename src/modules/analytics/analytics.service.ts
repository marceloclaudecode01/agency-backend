import prisma from '../../config/database';

export class AnalyticsService {
  async getOverview(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalPosts, publishedPosts, failedPosts, totalComments, performances, latestMetrics] = await Promise.all([
      prisma.scheduledPost.count({ where: { createdAt: { gte: since } } }),
      prisma.scheduledPost.count({ where: { status: 'PUBLISHED', publishedAt: { gte: since } } }),
      prisma.scheduledPost.count({ where: { status: 'FAILED', createdAt: { gte: since } } }),
      prisma.commentLog.count({ where: { action: 'REPLIED', createdAt: { gte: since } } }),
      prisma.postPerformance.aggregate({
        where: { collectedAt: { gte: since } },
        _sum: { likes: true, comments: true, shares: true },
        _avg: { engagementRate: true },
      }),
      prisma.metricsReport.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      period: `${days}d`,
      totalPosts,
      publishedPosts,
      failedPosts,
      successRate: totalPosts > 0 ? Math.round((publishedPosts / totalPosts) * 100) : 0,
      commentsReplied: totalComments,
      engagement: {
        totalLikes: performances._sum.likes || 0,
        totalComments: performances._sum.comments || 0,
        totalShares: performances._sum.shares || 0,
        avgEngagementRate: Math.round((performances._avg.engagementRate || 0) * 100) / 100,
      },
      growthScore: latestMetrics?.growthScore || 0,
    };
  }

  async getPostsRanking(limit = 20) {
    const posts = await prisma.postPerformance.findMany({
      orderBy: { likes: 'desc' },
      take: limit,
      include: {
        scheduledPost: { select: { topic: true, message: true, publishedAt: true, platform: true, imageUrl: true } },
      },
    });

    return posts.map((p) => ({
      id: p.id,
      topic: p.scheduledPost.topic,
      message: p.scheduledPost.message.substring(0, 150),
      platform: p.platform,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      engagementRate: p.engagementRate,
      publishedAt: p.scheduledPost.publishedAt,
      hasMedia: !!p.scheduledPost.imageUrl,
    }));
  }

  async getBestTimes() {
    const reports = await prisma.metricsReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { bestPostingTimes: true, createdAt: true },
    });

    return reports.map((r) => ({
      bestTimes: r.bestPostingTimes,
      reportDate: r.createdAt,
    }));
  }

  async getAgentActivity(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await prisma.agentLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { from: true, type: true, message: true, createdAt: true },
    });

    // Group by agent
    const agentCounts: Record<string, { total: number; errors: number; lastActive: Date }> = {};
    for (const log of logs) {
      if (!agentCounts[log.from]) {
        agentCounts[log.from] = { total: 0, errors: 0, lastActive: log.createdAt };
      }
      agentCounts[log.from].total++;
      if (log.type === 'error') agentCounts[log.from].errors++;
    }

    return {
      period: `${hours}h`,
      totalLogs: logs.length,
      agents: agentCounts,
      recentLogs: logs.slice(0, 20),
    };
  }
}
