import cron from 'node-cron';
import prisma from '../config/database';
import { SocialService } from '../modules/social/social.service';
import { generateCommentReply } from './comment-responder.agent';
import { analyzeMetrics } from './metrics-analyzer.agent';
import { notificationsService } from '../modules/notifications/notifications.service';
import { buildDailyStrategy } from './content-strategist.agent';
import { generatePostFromStrategy } from './content-creator.agent';

const socialService = new SocialService();

// Limite de segurança: máx 5 posts por dia, mínimo 2h de intervalo
const MAX_POSTS_PER_DAY = 5;
const MIN_INTERVAL_HOURS = 2;

async function getPostsPublishedToday(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.scheduledPost.count({
    where: {
      status: 'PUBLISHED',
      publishedAt: { gte: today },
    },
  });
  return count;
}

async function getLastPublishedAt(): Promise<Date | null> {
  const last = await prisma.scheduledPost.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
  });
  return last?.publishedAt || null;
}

// Roda a cada 5 minutos: verifica posts agendados para publicar
export function startPostScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    let pendingPosts: Awaited<ReturnType<typeof prisma.scheduledPost.findMany>> = [];
    try {
      const now = new Date();

      // Busca posts aprovados com scheduledFor <= agora
      pendingPosts = await prisma.scheduledPost.findMany({
        where: {
          status: 'APPROVED',
          scheduledFor: { lte: now },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 1, // publica um por vez
      });

      if (pendingPosts.length === 0) return;

      // Verificações de segurança
      const postsToday = await getPostsPublishedToday();
      if (postsToday >= MAX_POSTS_PER_DAY) {
        console.log(`[Scheduler] Limite diário atingido (${MAX_POSTS_PER_DAY} posts). Aguardando amanhã.`);
        return;
      }

      const lastPublished = await getLastPublishedAt();
      if (lastPublished) {
        const hoursSinceLast = (now.getTime() - lastPublished.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast < MIN_INTERVAL_HOURS) {
          console.log(`[Scheduler] Intervalo mínimo não atingido. Próximo post em ${(MIN_INTERVAL_HOURS - hoursSinceLast).toFixed(1)}h`);
          return;
        }
      }

      const post = pendingPosts[0];

      // Publica no Facebook
      const fullMessage = post.hashtags
        ? `${post.message}\n\n${post.hashtags}`
        : post.message;

      await socialService.publishPost(fullMessage);

      // Marca como publicado
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'PUBLISHED', publishedAt: now },
      });

      console.log(`[Scheduler] Post publicado: "${post.message.substring(0, 50)}..."`);

      // Notifica admins sobre a publicação
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationsService.createAndEmit(
          admin.id,
          'TASK_ASSIGNED',
          'Post publicado!',
          `"${post.topic || post.message.substring(0, 50)}" foi publicado no Facebook`
        );
      }
    } catch (err: any) {
      console.error('[Scheduler] Erro ao publicar post:', err.message);
      // Marca post como FAILED para não ficar em loop infinito
      try {
        await prisma.scheduledPost.update({
          where: { id: pendingPosts[0]?.id },
          data: { status: 'FAILED' },
        });
      } catch {}
    }
  });

  console.log('[Scheduler] Post scheduler iniciado (verificação a cada 5 minutos)');
}

// Roda a cada 30 minutos: verifica e responde comentários novos
export function startCommentResponder() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const posts = await socialService.getPosts(10);

      for (const post of posts) {
        const comments = await socialService.getPostComments(post.id);

        for (const comment of comments) {
          // Verifica se já foi respondido
          const alreadyReplied = await prisma.commentLog.findFirst({
            where: { commentId: comment.id },
          });
          if (alreadyReplied) continue;

          // Gera resposta com IA
          const reply = await generateCommentReply(
            comment.message,
            post.message || post.story
          );

          if (!reply) {
            // Spam/ofensa — apenas loga
            await prisma.commentLog.create({
              data: { commentId: comment.id, action: 'IGNORED', reply: '' },
            });
            continue;
          }

          // Posta a resposta via SocialService
          await socialService.replyToComment(comment.id, reply);

          await prisma.commentLog.create({
            data: { commentId: comment.id, action: 'REPLIED', reply },
          });

          console.log(`[Comments] Respondido: "${comment.message.substring(0, 40)}" → "${reply.substring(0, 40)}"`);

          // Pausa 3s entre respostas para não parecer bot
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    } catch (err: any) {
      console.error('[Comments] Erro:', err.message);
    }
  });

  console.log('[Comments] Comment responder iniciado (verificação a cada 30 minutos)');
}

// Roda todo dia às 8h: análise de métricas
export function startMetricsAnalyzer() {
  cron.schedule('0 8 * * *', async () => {
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

      await prisma.metricsReport.create({
        data: {
          summary: report.summary,
          highlights: report.highlights,
          recommendations: report.recommendations,
          bestPostingTimes: report.bestPostingTimes,
          growthScore: report.growthScore,
          rawData: { pageInfo, insights },
        },
      });

      console.log(`[Metrics] Relatório gerado. Score: ${report.growthScore}/10`);
    } catch (err: any) {
      console.error('[Metrics] Erro:', err.message);
    }
  });

  console.log('[Metrics] Metrics analyzer iniciado (roda todo dia às 08:00)');
}

function startDueDateNotifier() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const tasks = await prisma.task.findMany({
        where: {
          dueDate: { lte: twoDaysFromNow, gte: new Date() },
          status: { not: 'DONE' },
          assigneeId: { not: null },
        },
      });

      for (const task of tasks) {
        await notificationsService.createAndEmit(
          task.assigneeId!,
          'TASK_DUE',
          'Prazo próximo',
          `A tarefa "${task.title}" vence em breve!`,
          task.id
        );
      }

      if (tasks.length > 0) {
        console.log(`[DueDate] ${tasks.length} notificação(ões) de prazo enviadas`);
      }
    } catch (err: any) {
      console.error('[DueDate] Erro:', err.message);
    }
  });

  console.log('[DueDate] Verificador de prazos iniciado (roda todo dia às 08:00)');
}

// Motor autônomo: roda todo dia às 07:00 e agenda posts do dia
export function startAutonomousContentEngine() {
  cron.schedule('0 7 * * *', async () => {
    console.log('[Engine] Iniciando ciclo autônomo de conteúdo...');
    try {
      const strategy = await buildDailyStrategy();
      console.log(`[Engine] Estratégia: ${strategy.postsToCreate} posts — ${strategy.reasoning}`);

      // Busca tópicos recentes para evitar repetição
      const recentPosts = await prisma.scheduledPost.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: { topic: true },
      });
      const recentTopics = recentPosts.map((p) => p.topic).filter(Boolean) as string[];

      const today = new Date();
      const scheduledIds: string[] = [];

      for (let i = 0; i < strategy.postsToCreate; i++) {
        try {
          const topic = strategy.topics[i];
          const focusType = strategy.focusType[i] || 'entretenimento';
          const timeStr = strategy.scheduledTimes[i] || '18:00';

          const generated = await generatePostFromStrategy(topic, focusType, recentTopics);

          // Monta o scheduledFor com a data de hoje + horário da estratégia
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

          scheduledIds.push(saved.id);
          recentTopics.push(topic); // evita repetição dentro do mesmo ciclo
          console.log(`[Engine] Post ${i + 1}/${strategy.postsToCreate} agendado: "${topic}" às ${timeStr}`);
        } catch (err: any) {
          console.error(`[Engine] Erro ao gerar post ${i + 1}:`, err.message);
        }
      }

      // Notifica admins
      if (scheduledIds.length > 0) {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        const topicsList = strategy.topics.slice(0, scheduledIds.length).join(', ');
        for (const admin of admins) {
          await notificationsService.createAndEmit(
            admin.id,
            'TASK_ASSIGNED',
            'Motor autônomo ativo',
            `${scheduledIds.length} post(s) agendados para hoje: ${topicsList}`
          );
        }
      }

      console.log(`[Engine] Ciclo concluído. ${scheduledIds.length}/${strategy.postsToCreate} posts agendados.`);
    } catch (err: any) {
      console.error('[Engine] Erro no ciclo autônomo:', err.message);
    }
  });

  console.log('[Engine] Motor autônomo iniciado (roda todo dia às 07:00)');
}

export function startAllAgents() {
  startPostScheduler();
  startCommentResponder();
  startMetricsAnalyzer();
  startDueDateNotifier();
  startAutonomousContentEngine();
  console.log('[Agents] Todos os agentes iniciados ✓');
}
