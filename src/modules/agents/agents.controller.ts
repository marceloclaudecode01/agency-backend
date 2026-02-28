import { Request, Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import { generatePost, generateWeeklyPlan, generatePostFromStrategy } from '../../agents/content-creator.agent';
import { analyzeMetrics } from '../../agents/metrics-analyzer.agent';
import { buildDailyStrategy } from '../../agents/content-strategist.agent';
import { analyzeTrendingTopics } from '../../agents/trending-topics.agent';
import { orchestrateProductPosts } from '../../agents/product-orchestrator.agent';
import { fetchBestProducts, fetchTrendingProducts } from '../../agents/tiktok-researcher.agent';
import { analyzePageGrowth } from '../../agents/growth-analyst.agent';
import { checkFacebookToken } from '../../agents/token-monitor.agent';
import { agentLog } from '../../agents/agent-logger';
import cloudinary from '../../config/cloudinary';
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
      const { topic, message, hashtags, imageUrl, mediaUrl, scheduledFor } = req.body;
      const post = await prisma.scheduledPost.create({
        data: {
          topic,
          message,
          hashtags: hashtags ? hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ') : null,
          imageUrl: mediaUrl || imageUrl || null,
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

  // Analisa trending topics agora
  async getTrendingTopics(req: AuthRequest, res: Response) {
    try {
      const { niche, targetAudience } = req.query as { niche?: string; targetAudience?: string };
      const report = await analyzeTrendingTopics(niche, targetAudience);
      return ApiResponse.success(res, report, 'Trending topics analisados');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to analyze trending topics', 500);
    }
  }

  // Busca produtos trending do TikTok Shop
  async getTikTokProducts(req: AuthRequest, res: Response) {
    try {
      const { query } = req.query as { query?: string };
      const products = query
        ? await fetchTrendingProducts(query, 15)
        : await fetchBestProducts();
      return ApiResponse.success(res, products, `${products.length} produtos encontrados`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to fetch TikTok products', 500);
    }
  }

  // Executa ciclo completo: pesquisa + copy + agenda posts de produto
  async runProductOrchestrator(req: AuthRequest, res: Response) {
    try {
      const { query } = req.body;
      const result = await orchestrateProductPosts(query);
      return ApiResponse.success(res, result, `${result.postsCreated} posts de produto criados`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to run product orchestrator', 500);
    }
  }

  // Analisa link de produto, cria copy e agenda post
  async createPostFromLink(req: AuthRequest, res: Response) {
    try {
      const { url, scheduledFor, mediaUrl } = req.body;
      if (!url) return ApiResponse.error(res, 'URL é obrigatória', 400);

      await agentLog('LinkAnalyzer', `Analisando link: ${url}`, { type: 'action', to: 'Groq' });

      // 1. Resolve redirect do link curto e extrai dados do produto
      const { analyzeProductLink } = await import('../../agents/link-analyzer.agent');
      const productInfo = await analyzeProductLink(url);

      await agentLog('LinkAnalyzer', `Produto identificado: ${productInfo.name}`, { type: 'result' });

      // 2. Copywriter cria o post
      const { askGemini } = await import('../../agents/gemini');
      const prompt = `
Você é um copywriter especialista em marketing digital brasileiro para Facebook.

Produto: ${productInfo.name}
Preço: ${productInfo.price}
Categoria: ${productInfo.category}
Descrição: ${productInfo.description}
Destaques: ${productInfo.highlights.join(', ')}
Link do produto: ${url}

Crie um post persuasivo para Facebook que:
1. Para o scroll na primeira linha (hook poderoso, máx 10 palavras)
2. Gera desejo imediato de compra com os benefícios do produto
3. Inclui o link do produto no final
4. Usa emojis estrategicamente (máx 5)
5. Tom brasileiro, próximo e empolgante

Retorne APENAS JSON válido:
{
  "message": "texto completo do post incluindo o link ${url} no final",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}`;

      const raw = await askGemini(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Erro ao gerar copy do post');

      const copy = JSON.parse(jsonMatch[0]);
      const hashtagsStr = (copy.hashtags || []).map((h: string) => `#${h.replace('#', '')}`).join(' ');

      // 3. Agenda o post
      const scheduleDate = scheduledFor ? new Date(scheduledFor) : (() => {
        const d = new Date();
        d.setHours(19, 0, 0, 0);
        if (d < new Date()) d.setDate(d.getDate() + 1);
        return d;
      })();

      const saved = await prisma.scheduledPost.create({
        data: {
          topic: `Produto: ${productInfo.name.substring(0, 60)}`,
          message: copy.message,
          hashtags: hashtagsStr,
          imageUrl: mediaUrl || null,
          status: 'APPROVED',
          scheduledFor: scheduleDate,
        },
      });

      await agentLog('Scheduler', `Post agendado: "${productInfo.name.substring(0, 40)}" para ${scheduleDate.toLocaleString('pt-BR')}`, { type: 'action', to: 'Database' });

      return ApiResponse.success(res, {
        post: saved,
        productInfo,
      }, 'Post criado e agendado com sucesso');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Falha ao criar post do link', 500);
    }
  }

  // Análise de growth da página
  async getGrowthInsights(req: AuthRequest, res: Response) {
    try {
      const insights = await analyzePageGrowth();
      return ApiResponse.success(res, insights, 'Insights de growth gerados');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to analyze growth', 500);
    }
  }

  // Status do token do Facebook
  async getTokenStatus(req: AuthRequest, res: Response) {
    try {
      const status = await checkFacebookToken();
      return ApiResponse.success(res, status, 'Token status verificado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to check token', 500);
    }
  }

  // Logs de comunicação entre agentes
  async getAgentLogs(req: AuthRequest, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 200);
      const agentName = req.query.agent as string | undefined;
      const where = agentName ? { OR: [{ from: agentName }, { to: agentName }] } : {};

      const logs = await prisma.agentLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return ApiResponse.success(res, logs.reverse());
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to get agent logs', 500);
    }
  }

  // Upload de imagem ou vídeo para o Cloudinary
  async uploadMedia(req: AuthRequest, res: Response) {
    try {
      const file = (req as any).file;
      if (!file) return ApiResponse.error(res, 'Nenhum arquivo enviado', 400);

      const isVideo = file.mimetype.startsWith('video/');
      const resourceType = isVideo ? 'video' : 'image';

      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: 'agency-posts',
            transformation: isVideo
              ? [{ duration: '120' }] // limita a 2 minutos
              : [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(file.buffer);
      });

      return ApiResponse.success(res, {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType,
        width: result.width,
        height: result.height,
        duration: result.duration,
      }, 'Arquivo enviado com sucesso');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Erro ao fazer upload', 500);
    }
  }
}
