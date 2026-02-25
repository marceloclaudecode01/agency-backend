import { Request, Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import { generatePost, generateWeeklyPlan, generatePostFromStrategy } from '../../agents/content-creator.agent';
import { analyzeMetrics } from '../../agents/metrics-analyzer.agent';
import { buildDailyStrategy } from '../../agents/content-strategist.agent';
import { SocialService } from '../social/social.service';
import { notificationsService } from '../notifications/notifications.service';
import prisma from '../../config/database';

const socialService = new SocialService();

export class AgentsController {
  // Gera um post com IA (para aprovação)
  async generatePost(req: AuthRequest, res: Response) {
    try {
      const { topic, extraContext } = req.body;
      const post = await generatePost(topic, extraContext);
      return ApiResponse.success(res, post, 'Post generated successfully');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to generate post', 500);
    }
  }

  // Gera plano semanal com IA
  async generateWeeklyPlan(req: AuthRequest, res: Response) {
    try {
      const { focus } = req.body;
      const plan = await generateWeeklyPlan(focus);
      return ApiResponse.success(res, plan, 'Weekly plan generated');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to generate weekly plan', 500);
    }
  }

  // Lista posts agendados
  async getScheduledPosts(req: AuthRequest, res: Response) {
    try {
      const posts = await prisma.scheduledPost.findMany({
        orderBy: { scheduledFor: 'asc' },
      });
      return ApiResponse.success(res, posts);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to get scheduled posts', 500);
    }
  }

  // Cria post agendado (após aprovação)
  async createScheduledPost(req: AuthRequest, res: Response) {
    try {
      const { topic, message, hashtags, imageUrl, scheduledFor } = req.body;
      const post = await prisma.scheduledPost.create({
        data: {
          topic,
          message,
          hashtags: hashtags ? hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ') : null,
          imageUrl,
          scheduledFor: new Date(scheduledFor),
          status: 'APPROVED',
        },
      });
      return ApiResponse.created(res, post, 'Post scheduled successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to schedule post', 500);
    }
  }

  // Aprova post gerado
  async approvePost(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { scheduledFor } = req.body;
      const post = await prisma.scheduledPost.update({
        where: { id: id as string },
        data: { status: 'APPROVED', scheduledFor: new Date(scheduledFor) },
      });
      return ApiResponse.success(res, post, 'Post approved');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to approve post', 500);
    }
  }

  // Rejeita post gerado
  async rejectPost(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const post = await prisma.scheduledPost.update({
        where: { id: id as string },
        data: { status: 'REJECTED' },
      });
      return ApiResponse.success(res, post, 'Post rejected');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to reject post', 500);
    }
  }

  // Deleta post agendado
  async deleteScheduledPost(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.scheduledPost.delete({ where: { id: id as string } });
      return ApiResponse.success(res, null, 'Post deleted');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to delete post', 500);
    }
  }

  // Busca relatórios de métricas
  async getMetricsReports(req: AuthRequest, res: Response) {
    try {
      const reports = await prisma.metricsReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      return ApiResponse.success(res, reports);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to get reports', 500);
    }
  }

  // Força análise de métricas agora
  async runMetricsNow(req: AuthRequest, res: Response) {
    try {
      const pageInfo = await socialService.getPageInfo();
      const insights = await socialService.getPageInsights('week');
      const posts = await socialService.getPosts(7);

      const report = await analyzeMetrics({
        followers: pageInfo.followers_count || 0,
        followersPrev: (pageInfo.followers_count || 0) - (insights.page_fan_adds?.value || 0),
        reach: insights.page_impressions_unique?.value || 0,
        engagement: insights.page_engaged_users?.value || 0,
        posts,
      });

      const saved = await prisma.metricsReport.create({
        data: {
          summary: report.summary,
          highlights: report.highlights,
          recommendations: report.recommendations,
          bestPostingTimes: report.bestPostingTimes,
          growthScore: report.growthScore,
          rawData: { pageInfo, insights },
        },
      });

      return ApiResponse.success(res, saved, 'Metrics analyzed');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to analyze metrics', 500);
    }
  }

  // Status do motor autônomo
  async getEngineStatus(req: AuthRequest, res: Response) {
    try {
      // Último ciclo: último post criado com status APPROVED de forma automática
      const lastScheduled = await prisma.scheduledPost.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, topic: true, scheduledFor: true, status: true },
      });

      // Posts agendados para hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayPosts = await prisma.scheduledPost.findMany({
        where: { scheduledFor: { gte: today, lt: tomorrow } },
        orderBy: { scheduledFor: 'asc' },
        select: { id: true, topic: true, scheduledFor: true, status: true },
      });

      // Stats dos últimos 7 dias
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekStats = await prisma.scheduledPost.groupBy({
        by: ['status'],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { id: true },
      });

      const stats = {
        generated: weekStats.find((s) => s.status === 'APPROVED')?._count.id || 0,
        published: weekStats.find((s) => s.status === 'PUBLISHED')?._count.id || 0,
        failed: weekStats.find((s) => s.status === 'FAILED')?._count.id || 0,
      };

      return ApiResponse.success(res, {
        active: true,
        lastCycle: lastScheduled?.createdAt || null,
        todayPosts,
        weekStats: stats,
      });
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to get engine status', 500);
    }
  }

  // Executa o motor autônomo agora (fora do horário programado)
  async runEngineNow(req: AuthRequest, res: Response) {
    try {
      const strategy = await buildDailyStrategy();

      const recentPosts = await prisma.scheduledPost.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: { topic: true },
      });
      const recentTopics = recentPosts.map((p) => p.topic).filter(Boolean) as string[];

      const today = new Date();
      const created: any[] = [];

      for (let i = 0; i < strategy.postsToCreate; i++) {
        try {
          const topic = strategy.topics[i];
          const focusType = strategy.focusType[i] || 'entretenimento';
          const timeStr = strategy.scheduledTimes[i] || '18:00';

          const generated = await generatePostFromStrategy(topic, focusType, recentTopics);

          const [hours, minutes] = timeStr.split(':').map(Number);
          const scheduledFor = new Date(today);
          scheduledFor.setHours(hours, minutes, 0, 0);

          const hashtagsStr = generated.hashtags
            ? generated.hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ')
            : null;

          const saved = await prisma.scheduledPost.create({
            data: {
              topic: generated.topic || topic,
              message: generated.message,
              hashtags: hashtagsStr,
              status: 'APPROVED',
              scheduledFor,
            },
          });

          created.push(saved);
          recentTopics.push(topic);
        } catch (err: any) {
          console.error(`[Engine/Manual] Erro ao gerar post ${i + 1}:`, err.message);
        }
      }

      // Notifica admins
      if (created.length > 0) {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        const topicsList = created.map((p) => p.topic).join(', ');
        for (const admin of admins) {
          await notificationsService.createAndEmit(
            admin.id,
            'TASK_ASSIGNED',
            'Motor autônomo executado',
            `${created.length} post(s) agendados manualmente: ${topicsList}`
          );
        }
      }

      return ApiResponse.success(res, { strategy, created }, `${created.length} posts agendados com sucesso`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to run engine', 500);
    }
  }
}
