import cron from 'node-cron';
import prisma from '../config/database';
import { SocialService } from '../modules/social/social.service';
import { generateCommentReply } from './comment-responder.agent';
import { analyzeMetrics } from './metrics-analyzer.agent';
import { generateImageForPost } from './image-generator.agent';
import { notificationsService } from '../modules/notifications/notifications.service';
import { buildDailyStrategy } from './content-strategist.agent';
import { generatePostFromStrategy } from './content-creator.agent';
import { analyzeTrendingTopics } from './trending-topics.agent';
import { orchestrateProductPosts } from './product-orchestrator.agent';
import { runTokenMonitor } from './token-monitor.agent';
import { generateVideoForPost } from './video-generator.agent';
import { agentLog } from './agent-logger';
import { startContentGovernor } from './content-governor.agent';
import { startGrowthDirector } from './growth-director.agent';
import { startSystemSentinel } from './system-sentinel.agent';
import { startPerformanceLearner } from './performance-learner.agent';
import { isSafeModeActive, isAgentPaused } from './safe-mode';
import { seedBrandConfig } from './brand-brain.agent';
import { enhanceWithViralMechanics } from './viral-mechanics.agent';
import { createABVariant, startABTestingEngine } from './ab-testing-engine.agent';
import { startReputationMonitor } from './reputation-monitor.agent';
import { startLeadCaptureAgent } from './lead-capture.agent';
import { startMonetizationEngine } from './monetization-engine.agent';
import { startStrategicCommandAgent } from './strategic-command.agent';
import { startMarketIntelligenceAgent } from './market-intelligence.agent';
import { startNicheLearningAgent } from './niche-learning.agent';
import { startPaidTrafficAgent } from './paid-traffic.agent';

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
      // Phase 1: Safe mode check
      if (await isSafeModeActive() || await isAgentPaused('Scheduler')) {
        return;
      }

      const now = new Date();

      pendingPosts = await prisma.scheduledPost.findMany({
        where: {
          status: 'APPROVED',
          scheduledFor: { lte: now },
          OR: [
            { governorDecision: 'APPROVE' },
            { governorDecision: null, source: null }, // backward compat: manual posts
          ],
        },
        orderBy: { scheduledFor: 'asc' },
        take: 1,
      });

      if (pendingPosts.length === 0) return;

      const postsToday = await getPostsPublishedToday();
      if (postsToday >= MAX_POSTS_PER_DAY) {
        await agentLog('Scheduler', `Limite diário atingido (${MAX_POSTS_PER_DAY} posts). Aguardando amanhã.`, { type: 'info' });
        return;
      }

      const lastPublished = await getLastPublishedAt();
      if (lastPublished) {
        const hoursSinceLast = (now.getTime() - lastPublished.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast < MIN_INTERVAL_HOURS) {
          await agentLog('Scheduler', `Intervalo mínimo não atingido. Próximo post em ${(MIN_INTERVAL_HOURS - hoursSinceLast).toFixed(1)}h`, { type: 'info' });
          return;
        }
      }

      const post = pendingPosts[0];

      // Skip natively scheduled posts (Meta handles them)
      if ((post as any).nativeScheduled) {
        return;
      }

      await agentLog('Scheduler', `Post encontrado para publicação: "${post.topic || post.message.substring(0, 50)}"`, { type: 'action', to: 'Facebook API' });

      const fullMessage = post.hashtags ? `${post.message}\n\n${post.hashtags}` : post.message;

      let publishResult: any;

      if (post.contentType === 'video') {
        // Generate and upload video
        try {
          await agentLog('Scheduler', `🎬 Gerando vídeo para: "${post.topic || 'post'}"`, { type: 'action' });
          const { videoPath, cleanup } = await generateVideoForPost(
            post.topic || 'conteúdo',
            'engajamento'
          );
          try {
            publishResult = await socialService.publishVideoFromFile(fullMessage, videoPath);
          } finally {
            cleanup();
          }
          await agentLog('Scheduler', '✅ Vídeo publicado no Facebook!', { type: 'result' });
        } catch (videoErr: any) {
          await agentLog('Scheduler', `⚠️ Falha no vídeo: ${videoErr.message}. Publicando como imagem.`, { type: 'error' });
          publishResult = post.imageUrl
            ? await socialService.publishMediaPost(fullMessage, post.imageUrl)
            : await socialService.publishPost(fullMessage);
        }
      } else {
        publishResult = post.imageUrl
          ? await socialService.publishMediaPost(fullMessage, post.imageUrl)
          : await socialService.publishPost(fullMessage);
      }

      const fbPostId = publishResult?.id || null;

      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'PUBLISHED', publishedAt: now } });

      if (fbPostId) {
        await prisma.productCampaign.updateMany({ where: { scheduledPostId: post.id }, data: { status: 'PUBLISHED', fbPostId } });
      }

      await agentLog('Scheduler', `✅ Post publicado no Facebook com sucesso! ID: ${fbPostId || 'N/A'}`, { type: 'result', payload: { topic: post.topic, fbPostId } });

      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'Post publicado!', `"${post.topic || post.message.substring(0, 50)}" foi publicado no Facebook`);
      }
    } catch (err: any) {
      const isPermissionError = err.response?.status === 403 ||
        (err.message && (err.message.includes('pages_manage_posts') || err.message.includes('pages_read_engagement') || err.message.includes('#200')));

      if (isPermissionError) {
        console.error('[Scheduler] ⚠️ Token sem permissão pages_manage_posts. Configure um Page Access Token com as permissões corretas no Facebook Developer.');
        await agentLog('Scheduler', '⚠️ Token sem permissão de publicação (pages_manage_posts). Posts marcados como FAILED. Atualize o token no Railway.', { type: 'error' });
        // Mark all pending posts as FAILED to stop retrying
        try {
          await prisma.scheduledPost.updateMany({
            where: { status: 'APPROVED' },
            data: { status: 'FAILED' },
          });
        } catch {}
        return;
      }

      console.error('[Scheduler] Erro ao publicar post:', err.message);
      await agentLog('Scheduler', `❌ Erro ao publicar post: ${err.message}`, { type: 'error' });
      try {
        await prisma.scheduledPost.update({ where: { id: pendingPosts[0]?.id }, data: { status: 'FAILED' } });
      } catch {}
    }
  });

  console.log('[Scheduler] Post scheduler iniciado (verificação a cada 5 minutos)');
}

// Palavras-chave que indicam interesse em comprar
const BUY_INTENT_KEYWORDS = [
  'quanto', 'preço', 'valor', 'custa', 'link', 'onde', 'compro', 'comprar',
  'quero', 'quero esse', 'quero essa', 'me manda', 'manda o link', 'como compro',
  'como faço', 'disponivel', 'disponível', 'vende', 'tem', 'aceita', 'parcela',
  'interessei', 'interessada', 'interessado', 'adorei', 'amei', 'preciso',
];

function hasBuyIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return BUY_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// Roda a cada 30 minutos: verifica e responde comentários novos
export function startCommentResponder() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await agentLog('Comment Responder', 'Verificando comentários novos nos posts...', { type: 'action', to: 'Facebook API' });
      let posts: any[] = [];
      try {
        posts = await socialService.getPosts(10);
      } catch (fetchErr: any) {
        await agentLog('Comment Responder', `⚠️ Não foi possível buscar posts do Facebook: ${fetchErr.message}. Aguardando próximo ciclo.`, { type: 'info' });
        return;
      }
      if (posts.length === 0) {
        await agentLog('Comment Responder', 'Nenhum post encontrado na página.', { type: 'info' });
        return;
      }

      const productCampaigns = await prisma.productCampaign.findMany({
        where: { status: 'PUBLISHED', autoReply: true, replyTemplate: { not: null } },
      });

      let repliedCount = 0;

      for (const post of posts) {
        const comments = await socialService.getPostComments(post.id);
        const campaign = productCampaigns.find(
          (c) => c.fbPostId === post.id || (post.message && c.generatedCopy && post.message.includes(c.generatedCopy.substring(0, 50)))
        );

        for (const comment of comments) {
          const alreadyReplied = await prisma.commentLog.findFirst({ where: { commentId: comment.id } });
          if (alreadyReplied) continue;

          let reply = '';

          if (campaign?.replyTemplate && hasBuyIntent(comment.message)) {
            const commenterName = comment.from?.name?.split(' ')[0] || 'você';
            reply = campaign.replyTemplate.replace('[NOME]', commenterName);
            await agentLog('Comment Responder', `💬 Intenção de compra detectada de "${comment.from?.name || 'usuário'}". Usando template de produto.`, { type: 'communication', to: 'Copywriter' });
          } else {
            await agentLog('Comment Responder', `Gerando resposta para comentário: "${comment.message.substring(0, 60)}"`, { type: 'communication', to: 'Gemini AI' });
            reply = await generateCommentReply(comment.message, post.message || post.story);
          }

          // Phase 5: Sentiment analysis before replying
          let sentiment: string | null = null;
          try {
            const { askGemini: askGeminiSentiment } = await import('./gemini');
            const sentimentRaw = await askGeminiSentiment(`Classifique o sentimento deste comentário em uma palavra: POSITIVE, NEUTRAL, NEGATIVE ou CRISIS.
Comentário: "${comment.message.substring(0, 200)}"
Retorne APENAS a classificação.`);
            const cleaned = sentimentRaw.trim().toUpperCase();
            if (['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'CRISIS'].includes(cleaned)) {
              sentiment = cleaned;
            }
          } catch {}

          // Phase 5: CRISIS — don't auto-reply, alert admin
          if (sentiment === 'CRISIS') {
            await prisma.commentLog.create({ data: { commentId: comment.id, action: 'CRISIS_HOLD', reply: '', sentiment } });
            await agentLog('Comment Responder', `🚨 CRISE detectada: "${comment.message.substring(0, 60)}" — resposta suspensa, admin notificado`, { type: 'error' });
            const crisisAdmins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
            for (const admin of crisisAdmins) {
              await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'CRISE: Comentário negativo', `Comentário de crise detectado: "${comment.message.substring(0, 100)}". Responda manualmente.`);
            }
            continue;
          }

          if (!reply) {
            await prisma.commentLog.create({ data: { commentId: comment.id, action: 'IGNORED', reply: '', sentiment } });
            continue;
          }

          try {
            await socialService.replyToComment(comment.id, reply);
          } catch (replyErr: any) {
            await agentLog('Comment Responder', `⚠️ Não foi possível responder comentário: ${replyErr.message}`, { type: 'info' });
            await prisma.commentLog.create({ data: { commentId: comment.id, action: 'FAILED', reply, sentiment } });
            continue;
          }
          await prisma.commentLog.create({ data: { commentId: comment.id, action: 'REPLIED', reply, sentiment } });
          repliedCount++;

          await agentLog('Comment Responder', `✅ Respondido: "${comment.message.substring(0, 40)}" → "${reply.substring(0, 40)}"`, { type: 'result' });
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      if (repliedCount === 0) {
        await agentLog('Comment Responder', 'Nenhum comentário novo para responder.', { type: 'info' });
      }
    } catch (err: any) {
      console.error('[Comments] Erro:', err.message);
      await agentLog('Comment Responder', `❌ Erro: ${err.message}`, { type: 'error' });
    }
  });

  console.log('[Comments] Comment responder iniciado (verificação a cada 30 minutos)');
}

// Roda todo dia às 8h: análise de métricas
export function startMetricsAnalyzer() {
  cron.schedule('0 8 * * *', async () => {
    try {
      await agentLog('Metrics Analyzer', 'Coletando dados da página no Facebook...', { type: 'action', to: 'Facebook API' });
      const pageInfo = await socialService.getPageInfo();
      const insights = await socialService.getPageInsights('week');
      const posts = await socialService.getPosts(7);

      await agentLog('Metrics Analyzer', `Dados coletados: ${pageInfo.followers_count || 0} seguidores. Enviando para análise...`, { type: 'communication', to: 'Gemini AI', payload: { followers: pageInfo.followers_count } });

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

      await agentLog('Metrics Analyzer', `📊 Relatório gerado. Score de crescimento: ${report.growthScore}/10. Enviando insights para Content Strategist...`, { type: 'result', to: 'Content Strategist', payload: { growthScore: report.growthScore, summary: report.summary } });
    } catch (err: any) {
      console.error('[Metrics] Erro:', err.message);
      await agentLog('Metrics Analyzer', `❌ Erro ao analisar métricas: ${err.message}`, { type: 'error' });
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
    await agentLog('Autonomous Engine', '🚀 Iniciando ciclo autônomo de conteúdo do dia...', { type: 'action' });
    try {
      await agentLog('Autonomous Engine', 'Solicitando estratégia diária ao Content Strategist...', { type: 'communication', to: 'Content Strategist' });
      const strategy = await buildDailyStrategy();

      await agentLog('Content Strategist', `Estratégia pronta: ${strategy.postsToCreate} posts — ${strategy.reasoning}`, { type: 'result', to: 'Autonomous Engine', payload: { postsToCreate: strategy.postsToCreate, topics: strategy.topics } });

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

          await agentLog('Autonomous Engine', `Solicitando post sobre "${topic}" ao Content Creator...`, { type: 'communication', to: 'Content Creator' });
          const generated = await generatePostFromStrategy(topic, focusType, recentTopics);
          await agentLog('Content Creator', `Post criado: "${generated.message.substring(0, 60)}..."`, { type: 'result', to: 'Autonomous Engine' });

          // Viral Mechanics Lab: enhance post before scheduling
          let viralScore: number | null = null;
          let viralEnhancements: any = null;
          try {
            await agentLog('Autonomous Engine', `Aplicando Viral Mechanics em "${topic}"...`, { type: 'communication', to: 'Viral Mechanics' });
            const enhanced = await enhanceWithViralMechanics(generated.message, topic, focusType);
            if (enhanced.viralScore > 5) {
              generated.message = enhanced.enhancedMessage;
              viralScore = enhanced.viralScore;
              viralEnhancements = {
                techniques: enhanced.appliedTechniques,
                hookType: enhanced.hookType,
                emotionalTrigger: enhanced.emotionalTrigger,
              };
              await agentLog('Viral Mechanics', `Post enhanced: score ${enhanced.viralScore}/10, hook: ${enhanced.hookType}`, { type: 'result', to: 'Autonomous Engine' });
            }
          } catch (viralErr: any) {
            await agentLog('Viral Mechanics', `⚠️ Enhancement falhou: ${viralErr.message}`, { type: 'error' });
          }

          // Generate image for every post
          let imageUrl: string | null = null;
          try {
            await agentLog('Autonomous Engine', `Gerando imagem para "${topic}"...`, { type: 'communication', to: 'Image Generator' });
            const image = await generateImageForPost(topic, focusType);
            imageUrl = image.url || null;
            await agentLog('Image Generator', `Imagem gerada para "${topic}"`, { type: 'result', to: 'Autonomous Engine' });
          } catch (imgErr: any) {
            await agentLog('Image Generator', `⚠️ Falha ao gerar imagem: ${imgErr.message}. Post será publicado sem imagem.`, { type: 'error' });
          }

          const [hours, minutes] = timeStr.split(':').map(Number);
          const scheduledFor = new Date(today);
          scheduledFor.setHours(hours, minutes, 0, 0);

          const hashtagsStr = generated.hashtags
            ? generated.hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ')
            : null;

          // ~30% of posts are video (every 3rd post)
          const isVideo = i % 3 === 2;
          const postContentType = isVideo ? 'video' : 'organic';

          const saved = await prisma.scheduledPost.create({
            data: {
              topic: generated.topic || topic,
              message: generated.message,
              hashtags: hashtagsStr,
              imageUrl,
              status: 'PENDING',
              source: 'autonomous-engine',
              contentType: postContentType,
              scheduledFor,
              viralScore,
              viralEnhancements,
            },
          });

          scheduledIds.push(saved.id);
          recentTopics.push(topic);
          await agentLog('Autonomous Engine', `📅 Post ${i + 1}/${strategy.postsToCreate} agendado: "${topic}" para as ${timeStr}`, { type: 'action', to: 'Scheduler' });

          // A/B Testing: create variant B for non-video posts
          if (postContentType !== 'video') {
            try {
              // Check if A/B testing is enabled (aggressive mode = always, normal = 50% of posts)
              let abEnabled = false;
              try {
                const aggConfig = await prisma.systemConfig.findUnique({ where: { key: 'aggressive_growth_mode' } });
                const isAggressive = aggConfig?.value === true || (aggConfig?.value as any)?.enabled === true;
                abEnabled = isAggressive || Math.random() < 0.5;
              } catch { abEnabled = Math.random() < 0.5; }

              if (abEnabled) {
                await agentLog('Autonomous Engine', `Criando variante A/B para "${topic}"...`, { type: 'communication', to: 'A/B Testing' });
                await createABVariant({
                  id: saved.id,
                  topic: generated.topic || topic,
                  contentType: postContentType,
                  scheduledFor,
                });
              }
            } catch (abErr: any) {
              await agentLog('A/B Testing', `⚠️ Falha ao criar variante: ${abErr.message}`, { type: 'error' });
            }
          }
        } catch (err: any) {
          await agentLog('Autonomous Engine', `❌ Erro ao gerar post ${i + 1}: ${err.message}`, { type: 'error' });
        }
      }

      if (scheduledIds.length > 0) {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        const topicsList = strategy.topics.slice(0, scheduledIds.length).join(', ');
        for (const admin of admins) {
          await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'Motor autônomo ativo', `${scheduledIds.length} post(s) agendados para hoje: ${topicsList}`);
        }
      }

      await agentLog('Autonomous Engine', `✅ Ciclo concluído. ${scheduledIds.length}/${strategy.postsToCreate} posts agendados para hoje.`, { type: 'result' });
    } catch (err: any) {
      console.error('[Engine] Erro no ciclo autônomo:', err.message);
      await agentLog('Autonomous Engine', `❌ Erro no ciclo autônomo: ${err.message}`, { type: 'error' });
    }
  });

  console.log('[Engine] Motor autônomo iniciado (roda todo dia às 07:00)');
}

// Roda toda segunda-feira às 6h: analisa tendências e notifica admins
export function startTrendingTopicsAgent() {
  cron.schedule('0 6 * * 1', async () => {
    await agentLog('Trending Topics', '🔍 Analisando tendências da semana via Gemini AI...', { type: 'action', to: 'Gemini AI' });
    try {
      const report = await analyzeTrendingTopics();

      // Store in TrendingCache for Content Strategist consumption
      await prisma.trendingCache.create({
        data: {
          trends: report.trends as any,
          generatedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const topicNames = report.trends.map((t: any) => t.topic).join(', ');

      await agentLog('Trending Topics', `📈 ${report.trends.length} tendências identificadas: ${topicNames}. Enviando para Content Strategist...`, { type: 'result', to: 'Content Strategist', payload: { trends: report.trends } });

      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'Tendências da semana prontas!', `${report.trends.length} temas em alta: ${topicNames}`);
      }
    } catch (err: any) {
      console.error('[Trending] Erro ao analisar tendências:', err.message);
      await agentLog('Trending Topics', `❌ Erro ao analisar tendências: ${err.message}`, { type: 'error' });
    }
  });

  console.log('[Trending] Agente de tendências iniciado (roda toda segunda às 06:00)');
}

// Roda todo dia às 10h e 15h: orquestra posts de produtos TikTok Shop
export function startProductOrchestrator() {
  cron.schedule('0 10,15 * * *', async () => {
    await agentLog('Product Orchestrator', '🛍️ Iniciando ciclo de produtos TikTok Shop...', { type: 'action', to: 'TikTok Researcher' });
    try {
      await agentLog('Product Orchestrator', 'Solicitando produtos em tendência ao TikTok Researcher...', { type: 'communication', to: 'TikTok Researcher' });
      const result = await orchestrateProductPosts();

      await agentLog('TikTok Researcher', `${result.productsFound} produtos encontrados em alta. Enviando para Copywriter...`, { type: 'result', to: 'Product Orchestrator' });
      if (result.postsCreated > 0) {
        await agentLog('Copywriter', `${result.postsCreated} copies persuasivos criados. Posts agendados para publicação.`, { type: 'result', to: 'Scheduler' });
      }
      await agentLog('Product Orchestrator', `✅ Ciclo concluído: ${result.productsFound} produtos, ${result.postsCreated} posts agendados.`, { type: 'result', payload: result });
    } catch (err: any) {
      console.error('[Products] Erro no ciclo de produtos:', err.message);
      await agentLog('Product Orchestrator', `❌ Erro no ciclo de produtos: ${err.message}`, { type: 'error' });
    }
  });

  console.log('[Products] Orquestrador de produtos iniciado (roda às 10:00 e 15:00)');
}

// Verifica token do Facebook todo dia às 9h
export function startTokenMonitor() {
  cron.schedule('0 9 * * *', async () => {
    try {
      await agentLog('Token Monitor', '🔑 Verificando validade do token do Facebook...', { type: 'action', to: 'Facebook API' });
      await runTokenMonitor();
      await agentLog('Token Monitor', '✅ Token do Facebook verificado com sucesso.', { type: 'result' });
    } catch (err: any) {
      console.error('[TokenMonitor] Erro:', err.message);
      await agentLog('Token Monitor', `❌ Problema com token do Facebook: ${err.message}`, { type: 'error' });
    }
  });

  runTokenMonitor().catch(() => {});
  console.log('[TokenMonitor] Monitor de token iniciado (verifica todo dia às 09:00)');
}

// Maps DB function field → actual start function
const AGENT_FUNCTION_MAP: Record<string, () => void> = {
  'post-scheduler': startPostScheduler,
  'comment-responder': startCommentResponder,
  'metrics-collector': startMetricsAnalyzer,
  'deadline-notifier': startDueDateNotifier,
  'content-engine': startAutonomousContentEngine,
  'trending-topics': startTrendingTopicsAgent,
  'tiktok-products': startProductOrchestrator,
  'token-monitor': startTokenMonitor,
  'content-governor': startContentGovernor,
  'growth-director': startGrowthDirector,
  'system-sentinel': startSystemSentinel,
  'performance-learner': startPerformanceLearner,
  'ab-testing': startABTestingEngine,
  'reputation-monitor': startReputationMonitor,
  'lead-capture': startLeadCaptureAgent,
  'monetization-engine': startMonetizationEngine,
  'strategic-command': startStrategicCommandAgent,
  'market-intelligence': startMarketIntelligenceAgent,
  'niche-learning': startNicheLearningAgent,
  'paid-traffic': startPaidTrafficAgent,
};

export async function updateLastRun(agentName: string): Promise<void> {
  try {
    await prisma.agent.updateMany({
      where: { OR: [{ name: agentName }, { function: agentName }] },
      data: { lastRunAt: new Date() },
    });
  } catch {}
}

export async function startAllAgents() {
  // Try loading active cron agents from DB
  let startedFromDB = false;
  try {
    const activeAgents = await prisma.agent.findMany({
      where: { status: 'active', cronExpression: { not: null } },
    });

    if (activeAgents.length > 0) {
      startedFromDB = true;
      let started = 0;
      for (const agent of activeAgents) {
        const fn = AGENT_FUNCTION_MAP[agent.function];
        if (fn) {
          fn();
          started++;
        }
      }
      console.log(`[Agents] ${started}/${activeAgents.length} cron agents started from DB`);
    }
  } catch {
    // DB not ready or agents table doesn't exist yet — fall back to hardcoded
  }

  // Fallback: start all if DB didn't provide agents
  if (!startedFromDB) {
    for (const fn of Object.values(AGENT_FUNCTION_MAP)) {
      fn();
    }
    console.log(`[Agents] ${Object.keys(AGENT_FUNCTION_MAP).length} agents started (hardcoded fallback)`);
  }

  // Seed brand config on startup
  seedBrandConfig().catch(() => {});
  agentLog('Sistema', `All agents started (DB-driven: ${startedFromDB}).`, { type: 'info' }).catch(() => {});
  console.log('[Agents] Todos os agentes iniciados ✓');
}
