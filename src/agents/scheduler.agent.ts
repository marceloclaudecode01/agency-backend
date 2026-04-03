import cron from 'node-cron';
import prisma from '../config/database';
import { SocialService, PageCredentials } from '../modules/social/social.service';
import { generateCommentReply, CommentClientContext, CommenterInfo, sortByPriority } from './comment-responder.agent';
import { analyzeMetrics } from './metrics-analyzer.agent';
import { generateImageForPost } from './image-generator.agent';
import { findNicheConfig } from '../config/niches';
import { notificationsService } from '../modules/notifications/notifications.service';
import { buildDailyStrategy, ClientContext } from './content-strategist.agent';
import { generatePostFromStrategy } from './content-creator.agent';
import { analyzeTrendingTopics } from './trending-topics.agent';
import { orchestrateProductPosts } from './product-orchestrator.agent';
import { runTokenMonitor, restorePersistedToken } from './token-monitor.agent';
import { agentLog } from './agent-logger';
import { trackAgentExecution } from './agent-performance-tracker';
import { startContentGovernor } from './content-governor.agent';
import { startGrowthDirector } from './growth-director.agent';
import { startSystemSentinel } from './system-sentinel.agent';
import { startPerformanceLearner } from './performance-learner.agent';
import { isSafeModeActive } from './safe-mode';
import { runQuantumTraining, getTrainingStats } from '../modules/easyorios/core/quantum-feedback-engine';
import { seedBrandConfig } from './brand-brain.agent';
import { enhanceWithViralMechanics } from './viral-mechanics.agent';
import { createABVariant, startABTestingEngine } from './ab-testing-engine.agent';
import { startReputationMonitor } from './reputation-monitor.agent';
import { startLeadCaptureAgent } from './lead-capture.agent';
import { startStrategicCommandAgent } from './strategic-command.agent';
import { startNicheLearningAgent } from './niche-learning.agent';
import { startStrategicEngine } from './strategic-engine.agent';
import { startTikTokRecycler } from './tiktok-recycler.agent';
import { startTikTokContentFactory } from './tiktok-content-factory.agent';
import { startEvolutionEngine } from './evolution-engine.agent';
import { startShortVideoEngine } from './short-video-engine.agent';
import { startGrowthAnalyst } from './growth-analyst.agent';
import { startLeadNurtureAgent } from './lead-nurture.agent';
import { agentError } from './agent-error-handler';
import { generateCarouselFromStructure, shouldGenerateCarousel } from './carousel-generator.agent';
import { optimizeForPlatform } from './platform-optimizer.agent';
import { generatePremiumVideoLocal } from '../services/video-from-text.service';
import { startShopeeAffiliateAgent } from './shopee-affiliate.agent';
import { atomizePost } from '../services/content-atomizer.service';
import { recordHashtagUsage } from '../services/hashtag-intelligence.service';
// STANDBY: API direta do TikTok desativada — usando Buffer API
// import { TikTokService, TikTokCredentials } from '../modules/social/tiktok.service';
// Video generation is always available (cloud providers + local ffmpeg fallback)

// Generate video on-demand for an APPROVED post (only when about to publish)
// FREE PIPELINE: generates video locally → uploads directly to Facebook (no Cloudinary)
async function generateVideoLocalForPost(post: { message: string; topic?: string | null; contentType?: string | null; imageUrl?: string | null; clientId?: string | null }): Promise<{ videoPath: string } | null> {
  const topic = post.topic || 'conteúdo';
  const category = 'educativo';
  const maxRetries = 2;
  // Shopee posts: use product photo only (no AI image generation) — carousel with Ken Burns
  const isShopee = !!(post.topic?.startsWith('[SHOPEE]') && post.imageUrl);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[VideoOnDemand] Attempt ${attempt}/${maxRetries} for "${topic}" (client: ${post.clientId || 'default'}) — FREE pipeline${isShopee ? ' (Shopee carousel)' : ''}`);
      const result = await generatePremiumVideoLocal(post.message, topic, category, post.imageUrl || undefined, isShopee);
      console.log(`[VideoOnDemand] Video ready: ${result.videoPath} (${result.slideCount} slides, ${result.duration}s, narration: ${result.hasNarration}${isShopee ? ', mode: shopee-carousel' : ''})`);
      return { videoPath: result.videoPath };
    } catch (err: any) {
      console.error(`[VideoOnDemand] Attempt ${attempt} failed for "${topic}" (client: ${post.clientId || 'default'}): ${err.message}`);
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

// Default social service (env vars) — used for backward compat
const socialService = new SocialService();

// Helper: get SocialService for a specific post (client-aware)
async function getSocialServiceForPost(post: { clientId?: string | null }): Promise<SocialService> {
  if (post.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: post.clientId },
      select: { facebookPageId: true, facebookAccessToken: true, name: true },
    });
    if (client?.facebookPageId && client?.facebookAccessToken) {
      return new SocialService({
        pageId: client.facebookPageId,
        accessToken: client.facebookAccessToken,
      });
    }
  }
  // Fallback to default (env vars)
  return socialService;
}

// STANDBY: Helper da API direta do TikTok — desativada, usando Buffer API
// async function getTikTokServiceForPost(post: { clientId?: string | null }): Promise<TikTokService | null> {
//   if (!post.clientId) return null;
//   const client = await prisma.client.findUnique({ where: { id: post.clientId }, select: { ... } });
//   if (client?.tiktokOpenId && client?.tiktokAccessToken) return new TikTokService({...});
//   return null;
// }

// Limits per client — Facebook penalizes pages posting >5x/day (reduced reach, spam flags)
const MAX_POSTS_PER_DAY_PER_CLIENT = 4;
const MIN_INTERVAL_HOURS = 2;

async function getPostsPublishedToday(clientId?: string | null): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const where: any = { status: 'PUBLISHED', publishedAt: { gte: today } };
  if (clientId) where.clientId = clientId;
  else where.clientId = null; // only count default-page posts

  return prisma.scheduledPost.count({ where });
}

async function getLastPublishedAt(clientId?: string | null): Promise<Date | null> {
  const where: any = { status: 'PUBLISHED' };
  if (clientId) where.clientId = clientId;
  else where.clientId = null;

  const last = await prisma.scheduledPost.findFirst({
    where,
    orderBy: { publishedAt: 'desc' },
  });
  return last?.publishedAt || null;
}

// Check if current time is within ideal posting window (±30min of bestPostingHours)
async function isInIdealPostingWindow(): Promise<{ inWindow: boolean; nextWindowMinutes: number }> {
  try {
    const growthConfig = await prisma.systemConfig.findUnique({ where: { key: 'growth_insights' } });
    if (!growthConfig?.value) return { inWindow: true, nextWindowMinutes: 0 }; // No data = always publish

    const gi = growthConfig.value as any;
    const bestHours = gi.bestPostingHours as string[] | undefined;
    if (!bestHours || bestHours.length === 0) return { inWindow: true, nextWindowMinutes: 0 };

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const windowSize = 30; // ±30 minutes

    for (const timeStr of bestHours) {
      const [h, m] = timeStr.split(':').map(Number);
      if (isNaN(h)) continue;
      const targetMinutes = h * 60 + (m || 0);
      if (Math.abs(nowMinutes - targetMinutes) <= windowSize) {
        return { inWindow: true, nextWindowMinutes: 0 };
      }
    }

    // Find next window
    const sorted = bestHours.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }).sort((a, b) => a - b);
    let nextWindow = 0;
    for (const target of sorted) {
      if (target - windowSize > nowMinutes) {
        nextWindow = target - windowSize - nowMinutes;
        break;
      }
    }

    return { inWindow: false, nextWindowMinutes: nextWindow };
  } catch {
    return { inWindow: true, nextWindowMinutes: 0 }; // On error, allow publishing
  }
}

// Roda a cada 30 minutos: verifica posts agendados para publicar (was 15min — saves DB churn)
export function startPostScheduler() {
  cron.schedule('*/30 * * * *', async () => {
    await trackAgentExecution('post-scheduler', async () => {
    let pendingPosts: Awaited<ReturnType<typeof prisma.scheduledPost.findMany>> = [];
    try {
      const now = new Date();

      // Check safe mode — but still allow video posts through
      const safeMode = await isSafeModeActive();

      // ONLY publish posts that were explicitly APPROVED by the Governor
      // No backward-compat bypass — every post must pass quality review
      const approvedWhere = {
        status: 'APPROVED' as const,
        scheduledFor: { lte: now },
        governorDecision: 'APPROVE',
        governorReviewedAt: { not: null },
      };

      // FIX: Process ONE post per client per cycle to prevent cross-client conflicts
      // Group by clientId and pick the best candidate per client (video priority)
      const allApproved = await prisma.scheduledPost.findMany({
        where: { ...approvedWhere, contentType: 'video' },
        orderBy: { scheduledFor: 'asc' },
        take: 10,
      });

      const allApprovedNonVideo = allApproved.length === 0
        ? await prisma.scheduledPost.findMany({
            where: approvedWhere,
            orderBy: { scheduledFor: 'asc' },
            take: 10,
          })
        : allApproved;

      // Pick one post, but ensure we respect per-client limits BEFORE selecting
      let selectedPost: typeof allApprovedNonVideo[0] | null = null;
      for (const candidate of allApprovedNonVideo) {
        const clientPostsToday = await getPostsPublishedToday(candidate.clientId);
        const isVideo = candidate.contentType === 'video';
        if (!isVideo && clientPostsToday >= MAX_POSTS_PER_DAY_PER_CLIENT) continue;

        const lastPub = await getLastPublishedAt(candidate.clientId);
        const interval = isVideo ? 0.5 : MIN_INTERVAL_HOURS;
        if (lastPub) {
          const hoursSince = (now.getTime() - lastPub.getTime()) / (1000 * 60 * 60);
          if (hoursSince < interval) continue;
        }

        selectedPost = candidate;
        break;
      }

      pendingPosts = selectedPost ? [selectedPost] : [];

      if (pendingPosts.length === 0) return;

      const post = pendingPosts[0];
      const isVideoPost = post?.contentType === 'video';

      // Safe mode blocks non-video posts; videos always go through
      if (safeMode && !isVideoPost) {
        return;
      }

      // Limits already checked in candidate selection above

      // Ideal posting window check — only delay if post is not overdue by >1h
      if (!isVideoPost) {
        const postAge = now.getTime() - post.scheduledFor.getTime();
        const oneHourMs = 60 * 60 * 1000;
        if (postAge < oneHourMs) { // Post is not overdue by >1h
          const windowCheck = await isInIdealPostingWindow();
          if (!windowCheck.inWindow && windowCheck.nextWindowMinutes > 0) {
            console.log(`[Scheduler] Aguardando janela ideal (próxima em ${windowCheck.nextWindowMinutes}min)`);
            return;
          }
        }
      }

      // Skip natively scheduled posts (Meta handles them)
      if ((post as any).nativeScheduled) {
        return;
      }

      // OPTIMISTIC LOCK: atomically verify post is still APPROVED before publishing
      // If another cycle changed status (PUBLISHED, FAILED, etc), count=0 → skip
      const lockResult = await prisma.scheduledPost.updateMany({
        where: { id: post.id, status: 'APPROVED' },
        data: { updatedAt: new Date() },
      });
      if (lockResult.count === 0) {
        console.log(`[Scheduler] Post ${post.id} already claimed by another cycle — skipping`);
        return;
      }

      await agentLog('Scheduler', `Post encontrado para publicação: "${post.topic || post.message.substring(0, 50)}"${post.clientId ? ` (client: ${post.clientId})` : ''}`, { type: 'action', to: 'Facebook API' });

      const fullMessage = post.hashtags ? `${post.message}\n\n${post.hashtags}` : post.message;

      // Route by platform: TikTok or Facebook
      const postPlatform = post.platform || 'facebook';

      if (postPlatform === 'tiktok') {
        // === TikTok Publishing via Buffer API ===
        // (API direta do TikTok desativada — não aprovada. Usando Buffer como middleware)
        const { getBufferService } = await import('../services/buffer.service');
        let bufferService: ReturnType<typeof getBufferService> | null = null;
        try {
          bufferService = getBufferService();
        } catch {
          await agentLog('Scheduler', `⚠️ TikTok post "${post.topic}" skipped — BUFFER_TOKEN not configured`, { type: 'info' });
          await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'FAILED', governorReason: 'BUFFER_TOKEN not configured' } });
          return;
        }

        // TikTok requires video — generate on-demand if missing
        if (!post.videoUrl && !(post as any)._localVideoPath) {
          try {
            const videoResult = await generateVideoLocalForPost(post);
            if (videoResult) {
              (post as any)._localVideoPath = videoResult.videoPath;
            } else {
              await agentLog('Scheduler', `❌ TikTok post "${post.topic}" failed — video generation failed`, { type: 'error' });
              await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'FAILED', governorReason: 'Video generation failed' } });
              return;
            }
          } catch (vidErr: any) {
            await agentLog('Scheduler', `❌ TikTok video generation error: ${vidErr.message}`, { type: 'error' });
            await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'FAILED', governorReason: `Video generation error: ${vidErr.message}` } });
            return;
          }
        }

        try {
          // Get video URL — upload to Cloudinary if only local file exists
          let tiktokVideoUrl = post.videoUrl;
          if (!tiktokVideoUrl && (post as any)._localVideoPath) {
            const { uploadVideoFromUrl } = await import('../config/cloudinary');
            const uploaded = await uploadVideoFromUrl((post as any)._localVideoPath, 'agency-videos');
            tiktokVideoUrl = uploaded.url;
          }
          if (!tiktokVideoUrl) throw new Error('No video URL for TikTok');

          // Publish via Buffer API (GraphQL)
          const result = await bufferService.publishToTikTok(tiktokVideoUrl, fullMessage);
          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: { status: 'PUBLISHED', publishedAt: now, metaPostId: result.id, videoUrl: tiktokVideoUrl },
          });
          await agentLog('Scheduler', `✅ TikTok video published via Buffer: "${post.topic}" (bufferPostId: ${result.id})`, {
            type: 'result', payload: { topic: post.topic, bufferPostId: result.id, platform: 'tiktok' },
          });
        } catch (pubErr: any) {
          await agentLog('Scheduler', `❌ TikTok publish via Buffer failed: ${pubErr.message}`, { type: 'error' });
          await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'FAILED', governorReason: `Buffer TikTok publish error: ${pubErr.message}` } });
        } finally {
          // Clean up local video file
          try { if ((post as any)._localVideoPath) { const fs = await import('fs'); fs.unlinkSync((post as any)._localVideoPath); } } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
        }
      } else {
        // === Facebook Publishing — FREE PIPELINE (direct file upload, no Cloudinary) ===
        const postSocialService = await getSocialServiceForPost(post);

        let publishResult: any;

        if (post.contentType === 'video' && ((post as any)._localVideoPath || post.videoUrl)) {
          // FREE: Upload video directly from local file to Facebook (no Cloudinary needed)
          const localPath = (post as any)._localVideoPath
            || (post.videoUrl && /^(\/|[A-Za-z]:[\\/])/.test(post.videoUrl) && (await import('fs')).existsSync(post.videoUrl) ? post.videoUrl : null);
          if (localPath) {
            // Shopee video with affiliate link: use native link method (delay + plain comment)
            if (post.topic?.startsWith('[SHOPEE]') && post.source) {
              console.log(`[Scheduler] Publishing Shopee video with native link for "${post.topic}"...`);
              const nativeResult = await postSocialService.publishVideoWithNativeLink(
                fullMessage, localPath, post.source,
                { commentDelay: 8000, commentPrefix: 'Link do produto:' },
              );
              publishResult = { id: nativeResult.videoId };
              if (nativeResult.commentId) {
                await agentLog('Scheduler', `Native link commented on video ${nativeResult.videoId}`, { type: 'result', payload: { topic: post.topic, link: post.source, commentId: nativeResult.commentId } });
              }
            } else {
              console.log(`[Scheduler] Publishing video via direct file upload (FREE) for "${post.topic}"...`);
              publishResult = await postSocialService.publishVideoFromFile(fullMessage, localPath);
            }
            console.log(`[Scheduler] ✅ Published video (FREE/direct): ${post.topic}`);
            // Keep local video file alive for YouTube Shorts cross-post — cleanup happens after all cross-posts
            (post as any)._localVideoPath = localPath;
          } else {
            // Fallback: existing video URL (already uploaded somewhere)
            publishResult = await postSocialService.publishVideoPost(fullMessage, post.videoUrl!);
            console.log(`[Scheduler] ✅ Published video (URL): ${post.topic}`);
          }
          await agentLog('Scheduler', `Published video: "${post.topic}"`, { type: 'result', payload: { format: 'video', method: (post as any)._localVideoPath ? 'direct-upload' : 'url' } });
          // Shopee video: comment affiliate link after video publish (fallback for non-local videos)
          if (post.topic?.startsWith('[SHOPEE]') && post.source && !(post as any)._localVideoPath) {
            const shopeeVideoPostId = publishResult?.id || publishResult?.post_id;
            if (shopeeVideoPostId) {
              try {
                await new Promise((r) => setTimeout(r, 8000));
                await postSocialService.commentOnPost(shopeeVideoPostId, `Link do produto: ${post.source}`);
                await agentLog('Scheduler', `Affiliate link commented on video ${shopeeVideoPostId}`, { type: 'result', payload: { topic: post.topic, link: post.source } });
              } catch (commentErr: any) {
                await agentError('Scheduler', `Failed to comment affiliate link on video ${shopeeVideoPostId}`, commentErr, 'medium');
              }
            }
          }
        } else if (post.topic.startsWith('[SHOPEE]') && post.imageUrl) {
          // Shopee: publish image post, then comment with affiliate link (with delay for native link)
          publishResult = await postSocialService.publishMediaPost(fullMessage, post.imageUrl, { mediaType: 'image' });
          const shopeePostId = publishResult?.id || publishResult?.post_id;
          if (shopeePostId && post.source) {
            try {
              await new Promise((r) => setTimeout(r, 8000));
              await postSocialService.commentOnPost(shopeePostId, `Link do produto: ${post.source}`);
              await agentLog('Scheduler', `💬 Affiliate link commented on post ${shopeePostId}`, { type: 'result', payload: { topic: post.topic, link: post.source } });
            } catch (commentErr: any) {
              await agentError('Scheduler', `Failed to comment affiliate link on ${shopeePostId}`, commentErr, 'medium');
            }
          }
        } else if (post.imageUrl) {
          publishResult = await postSocialService.publishMediaPost(fullMessage, post.imageUrl, { mediaType: 'image' });
        } else {
          publishResult = await postSocialService.publishPost(fullMessage);
        }

        const fbPostId = publishResult?.id || null;

        await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'PUBLISHED', publishedAt: now } });

        if (fbPostId) {
          await prisma.productCampaign.updateMany({ where: { scheduledPostId: post.id }, data: { status: 'PUBLISHED', fbPostId } });
        }

        await agentLog('Scheduler', `✅ Post publicado no Facebook com sucesso! ID: ${fbPostId || 'N/A'}`, { type: 'result', payload: { topic: post.topic, fbPostId } });

        // Cross-post to Instagram (if image available and IG account linked)
        if (post.imageUrl && post.platform !== 'tiktok') {
          try {
            const igCaption = fullMessage.substring(0, 2200); // IG caption limit
            const igResult = await postSocialService.publishInstagramPhoto(igCaption, post.imageUrl);
            if (igResult?.id) {
              await agentLog('Scheduler', `📸 Cross-posted to Instagram! ID: ${igResult.id}`, { type: 'result', payload: { topic: post.topic, igPostId: igResult.id } });
            }
          } catch (igErr: any) {
            // Instagram is secondary — don't fail the publish cycle
            const isNotLinked = igErr.message?.includes('not linked');
            if (!isNotLinked) {
              await agentError('Scheduler', `Instagram cross-post failed for "${post.topic}"`, igErr, 'low');
            }
          }
        }

        // Cross-post to YouTube Shorts (if Shopee video + YouTube connected)
        if (post.contentType === 'video' && post.topic?.startsWith('[SHOPEE]') && (post as any)._localVideoPath) {
          try {
            const client = await prisma.client.findUnique({ where: { id: post.clientId! } });
            if (client?.youtubeRefreshToken && client?.youtubeChannelId) {
              const { YouTubeService } = await import('../modules/social/youtube.service');
              const ytService = new YouTubeService({
                clientId: client.id,
                channelId: client.youtubeChannelId,
                accessToken: client.youtubeAccessToken || '',
                refreshToken: client.youtubeRefreshToken,
                tokenExpiresAt: client.youtubeTokenExpiresAt || new Date(0),
              });
              const shortTitle = (post.topic || '').replace(/^\[SHOPEE\]\s*/, '').substring(0, 90);
              const shortDesc = post.source
                ? `${post.message}\n\n${post.source}\n\n${post.hashtags || ''}`
                : `${post.message}\n\n${post.hashtags || ''}`;
              const tags = (post.hashtags || '').split(/\s+/).filter((t: string) => t.startsWith('#')).map((t: string) => t.replace('#', ''));
              const ytResult = await ytService.uploadShort((post as any)._localVideoPath, shortTitle, shortDesc, tags);
              await agentLog('Scheduler', `YouTube Short published: ${ytResult.url} for "${post.topic}"`, {
                type: 'result', payload: { topic: post.topic, youtubeVideoId: ytResult.videoId, youtubeUrl: ytResult.url },
              });
              // Comment affiliate link on YouTube Short
              if (post.source && ytResult.videoId) {
                try {
                  await ytService.commentOnVideo(ytResult.videoId, `🛒 Compre aqui com desconto: ${post.source}`);
                } catch {}
              }
            }
          } catch (ytErr: any) {
            // YouTube is secondary — don't fail the publish cycle
            await agentError('Scheduler', `YouTube Shorts cross-post failed for "${post.topic}": ${ytErr.message}`, ytErr, 'low');
          }
        }

        // Clean up local video file after successful publish
        try { if ((post as any)._localVideoPath) { const fs = await import('fs'); fs.unlinkSync((post as any)._localVideoPath); } } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      }

      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'Post publicado!', `"${post.topic || post.message.substring(0, 50)}" foi publicado no Facebook`);
      }
    } catch (err: any) {
      const isPermissionError = err.response?.status === 403 ||
        (err.message && (err.message.includes('pages_manage_posts') || err.message.includes('pages_read_engagement') || err.message.includes('#200')));

      if (isPermissionError) {
        console.error('[Scheduler] ⚠️ Token sem permissão pages_manage_posts. Configure um Page Access Token com as permissões corretas no Facebook Developer.');
        const failedPost = pendingPosts[0];
        await agentLog('Scheduler', `⚠️ Token sem permissão de publicação. Post "${failedPost?.topic || failedPost?.id || 'unknown'}" marcado como FAILED. Atualize o token no Railway.`, { type: 'error' });
        // Mark only THIS post as FAILED (not all APPROVED posts)
        try {
          if (failedPost) {
            await prisma.scheduledPost.update({
              where: { id: failedPost.id },
              data: { status: 'FAILED' },
            });
          }
        } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
        // Throttled admin alert: max 1x per hour
        try {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const recentAlert = await prisma.notification.findFirst({
            where: { title: 'Erro de permissão Facebook', createdAt: { gte: oneHourAgo } },
          });
          if (!recentAlert) {
            const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
            for (const admin of admins) {
              await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'Erro de permissão Facebook', 'Token sem permissão pages_manage_posts. Atualize o token no Railway.');
            }
          }
        } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
        return;
      }

      console.error('[Scheduler] Erro ao publicar post:', err.message, err.response?.data ? JSON.stringify(err.response.data) : '');
      // Retry logic: 3 attempts with 30min backoff
      const currentPost = pendingPosts[0];
      if (currentPost) {
        const currentRetry = (currentPost as any).retryCount ?? 0;
        if (currentRetry < 3) {
          const nextAttempt = new Date(Date.now() + 30 * 60 * 1000); // +30min
          await agentLog('Scheduler', `⚠️ Erro ao publicar post (tentativa ${currentRetry + 1}/3): ${err.message}. Reagendando para ${nextAttempt.toTimeString().slice(0, 5)}`, { type: 'info' });
          try {
            await prisma.scheduledPost.update({
              where: { id: currentPost.id },
              data: { retryCount: currentRetry + 1, scheduledFor: nextAttempt },
            });
          } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
        } else {
          await agentLog('Scheduler', `❌ Post falhou após 3 tentativas: ${err.message}`, { type: 'error' });
          try {
            await prisma.scheduledPost.update({ where: { id: currentPost.id }, data: { status: 'FAILED' } });
          } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
        }
      }
    }
    }); // trackAgentExecution
  });

  console.log('[Scheduler] Post scheduler iniciado (verificação a cada 15 minutos + janelas ideais)');
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

// Extract signup/cadastro link from client niche field
function extractSignupLink(niche?: string | null): string | undefined {
  if (!niche) return undefined;
  const match = niche.match(/https?:\/\/federalassociados\.com\.br\S*/i);
  return match ? match[0] : undefined;
}

// Process comments for a single page (client or default)
async function processCommentsForPage(
  pageSocialService: SocialService,
  clientLabel: string,
  commentCtx?: CommentClientContext,
  clientId?: string
): Promise<number> {
  let posts: any[] = [];
  try {
    posts = await pageSocialService.getPosts(10);
  } catch (fetchErr: any) {
    await agentLog('Comment Responder', `${clientLabel} ⚠️ Não foi possível buscar posts: ${fetchErr.message}`, { type: 'info' });
    return 0;
  }
  if (posts.length === 0) return 0;

  const productCampaigns = await prisma.productCampaign.findMany({
    where: { status: 'PUBLISHED', autoReply: true, replyTemplate: { not: null } },
  });

  let repliedCount = 0;

  for (const post of posts) {
    let comments: any[] = [];
    try {
      comments = await pageSocialService.getPostComments(post.id);
    } catch (commentErr: any) {
      const msg = commentErr.response?.data?.error?.message || commentErr.message;
      if (msg.includes('pages_read_engagement') || msg.includes('Page Public Content Access')) {
        await agentLog('Comment Responder', `${clientLabel} ⚠️ Facebook App em modo Development — comments desabilitados.`, { type: 'info' });
        return repliedCount;
      }
      continue;
    }
    const campaign = productCampaigns.find(
      (c) => c.fbPostId === post.id || (post.message && c.generatedCopy && post.message.includes(c.generatedCopy.substring(0, 50)))
    );

    // Sort by priority: BUY_INTENT → DOUBT → COMMON → CRITICISM
    const sortedComments = sortByPriority(comments);

    for (const comment of sortedComments) {
      const alreadyReplied = await prisma.commentLog.findFirst({ where: { commentId: comment.id } });
      if (alreadyReplied) continue;

      let reply = '';

      const isBuyIntent = hasBuyIntent(comment.message);

      if (campaign?.replyTemplate && isBuyIntent) {
        const commenterName = comment.from?.name?.split(' ')[0] || 'você';
        reply = campaign.replyTemplate.replace('[NOME]', commenterName);
        await agentLog('Comment Responder', `${clientLabel} 💬 Intenção de compra detectada de "${comment.from?.name || 'usuário'}".`, { type: 'communication', to: 'Copywriter' });
      } else {
        await agentLog('Comment Responder', `${clientLabel} Gerando resposta para: "${comment.message.substring(0, 60)}"`, { type: 'communication', to: 'Gemini AI' });
        reply = await generateCommentReply(comment.message, post.message || post.story, commentCtx, {
          fbId: comment.from?.id,
          name: comment.from?.name,
          postId: post.id,
          clientId: clientId,
        });
      }

      // Inline lead capture — create lead immediately when buy intent detected
      if (isBuyIntent && reply) {
        try {
          const existingLead = await prisma.lead.findFirst({ where: { sourceId: comment.id } });
          if (!existingLead) {
            const commenterName = comment.from?.name || `Lead #${comment.id.slice(-6)}`;
            await prisma.lead.create({
              data: {
                name: commenterName,
                source: 'comment',
                sourceId: comment.id,
                stage: 'CONTACTED', // Already contacted (auto-reply sent)
                score: 80,
                lastContact: new Date(),
                notes: `Auto-captured + auto-replied. Comment: "${comment.message.substring(0, 200)}" | Reply: "${reply.substring(0, 200)}"`,
              },
            });
            await prisma.leadInteraction.create({
              data: {
                leadId: (await prisma.lead.findFirst({ where: { sourceId: comment.id } }))!.id,
                type: 'comment_reply',
                content: reply,
                direction: 'OUTBOUND',
              },
            });
            await agentLog('Comment Responder', `${clientLabel} 🎯 Lead criado e contactado: "${commenterName}"`, { type: 'result' });
          }
        } catch (leadErr: any) {
          console.error('[CommentResponder] Lead creation failed:', leadErr.message);
        }
      }

      // Hybrid sentiment: regex → score → LLM (only if ambiguous) — saves ~80% LLM calls
      let sentiment: string | null = null;
      try {
        sentiment = classifySentimentHybrid(comment.message || '');
        if (!sentiment) {
          // Ambiguous — fallback to LLM
          const { askGemini: askGeminiSentiment } = await import('./gemini');
          const sentimentRaw = await askGeminiSentiment(`Classifique o sentimento deste comentário em uma palavra: POSITIVE, NEUTRAL, NEGATIVE ou CRISIS.
Comentário: "${comment.message.substring(0, 200)}"
Retorne APENAS a classificação.`);
          const cleaned = sentimentRaw.trim().toUpperCase();
          if (['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'CRISIS'].includes(cleaned)) {
            sentiment = cleaned;
          }
        }
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }

      // CRISIS — don't auto-reply, alert admin
      if (sentiment === 'CRISIS') {
        await prisma.commentLog.create({ data: { commentId: comment.id, action: 'CRISIS_HOLD', reply: '', sentiment, commenterFbId: comment.from?.id, commenterName: comment.from?.name, commentText: comment.message?.substring(0, 500), postId: post.id, clientId: clientId } });
        await agentLog('Comment Responder', `${clientLabel} 🚨 CRISE detectada: "${comment.message.substring(0, 60)}" — admin notificado`, { type: 'error' });
        const crisisAdmins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        for (const admin of crisisAdmins) {
          await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', 'CRISE: Comentário negativo', `${clientLabel} "${comment.message.substring(0, 100)}". Responda manualmente.`);
        }
        continue;
      }

      if (!reply) {
        await prisma.commentLog.create({ data: { commentId: comment.id, action: 'IGNORED', reply: '', sentiment, commenterFbId: comment.from?.id, commenterName: comment.from?.name, commentText: comment.message?.substring(0, 500), postId: post.id, clientId: clientId } });
        continue;
      }

      try {
        await pageSocialService.replyToComment(comment.id, reply);
      } catch (replyErr: any) {
        await agentLog('Comment Responder', `${clientLabel} ⚠️ Falha ao responder: ${replyErr.message}`, { type: 'info' });
        await prisma.commentLog.create({ data: { commentId: comment.id, action: 'FAILED', reply, sentiment, commenterFbId: comment.from?.id, commenterName: comment.from?.name, commentText: comment.message?.substring(0, 500), postId: post.id, clientId: clientId } });
        continue;
      }
      await prisma.commentLog.create({ data: { commentId: comment.id, action: 'REPLIED', reply, sentiment, commenterFbId: comment.from?.id, commenterName: comment.from?.name, commentText: comment.message?.substring(0, 500), postId: post.id, clientId: clientId } });
      repliedCount++;

      await agentLog('Comment Responder', `${clientLabel} ✅ Respondido: "${comment.message.substring(0, 40)}" → "${reply.substring(0, 40)}"`, { type: 'result' });
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  return repliedCount;
}

// ─── Hybrid Sentiment Analysis (regex → score → LLM fallback) ───
// Tier 1: regex for obvious cases (~50-60%)
// Tier 2: keyword scoring for clear cases (~20-30%)
// Tier 3: returns null → caller uses LLM (~10-20%)
const CRISIS_PATTERNS = /\b(processo|procon|reclame.?aqui|advogado|justiça|denuncia|golpe|fraude|estelionato|enganado|roubou|roubo|nunca.?entregou|nao.?entregou|vou.?processar|absurdo|vergonha|crime|pior.?empresa)\b/i;
const NEGATIVE_PATTERNS = /\b(horrivel|horrível|pessimo|péssimo|lixo|porcaria|merda|nojento|odiei|detestei|nunca.?mais|nao.?funciona|nao.?presta|uma.?bosta|terrivel|terrível|decepcionado|decepcionante|propaganda.?enganosa|mentira)\b/i;
const POSITIVE_PATTERNS = /\b(amei|adorei|perfeito|excelente|maravilh|incrivel|incrível|recomendo|otimo|ótimo|parabens|parabéns|melhor|sensacional|top.?demais|show|nota.?10|aprovado|satisfeito|obrigad[oa]|lindo|massa|muito.?bom)\b/i;
const SPAM_PATTERNS = /\b(compre|clique|acesse|promoção.?imperdível|ganhe.?dinheiro|renda.?extra|trabalhe.?em.?casa|segue.?de.?volta|sigam|seguir.?de.?volta)\b/i;

const POSITIVE_WORDS = new Set(['bom','boa','legal','gostei','bacana','bonito','bonita','funciona','rapido','rápido','facil','fácil','show','top','demais','curti','amo','quero','lindo','linda','pago','comprei','chegou','recebi','recomendo','nota','estrelas']);
const NEGATIVE_WORDS = new Set(['ruim','mal','feio','feia','caro','demora','demorou','atrasou','atraso','quebrou','defeito','problema','errado','falso','falsa','reclamação','reclamar','devolver','devolução','estrago','fraco','fraca','pior','nao','não','nunca','péssima']);

function classifySentimentHybrid(text: string): string | null {
  if (!text || text.length < 3) return 'NEUTRAL';
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lowerOriginal = text.toLowerCase();

  // Tier 1: regex — obvious patterns
  if (CRISIS_PATTERNS.test(lowerOriginal)) return 'CRISIS';
  if (NEGATIVE_PATTERNS.test(lowerOriginal)) return 'NEGATIVE';
  if (POSITIVE_PATTERNS.test(lowerOriginal)) return 'POSITIVE';
  if (SPAM_PATTERNS.test(lowerOriginal)) return 'NEUTRAL';

  // Tier 2: keyword scoring
  const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  let score = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) score++;
    if (NEGATIVE_WORDS.has(w)) score--;
  }

  if (score >= 2) return 'POSITIVE';
  if (score <= -2) return 'NEGATIVE';
  if (score === 1 && words.length <= 5) return 'POSITIVE';
  if (score === -1 && words.length <= 5) return 'NEGATIVE';

  // Short neutral comments (emojis, "ok", "sim", etc.)
  if (text.length < 15 && score === 0) return 'NEUTRAL';

  // Tier 3: ambiguous — return null so caller uses LLM
  return null;
}

// Roda a cada 4 horas: verifica e responde comentários novos — MULTI-PAGE (was 2h — saves LLM tokens)
export function startCommentResponder() {
  cron.schedule('0 */4 * * *', async () => {
    await trackAgentExecution('comment-responder', async () => {
    try {
      await agentLog('Comment Responder', 'Verificando comentários novos (multi-page)...', { type: 'action', to: 'Facebook API' });

      // Load active clients with Facebook page config
      const activeClients = await prisma.client.findMany({
        where: { isActive: true, status: 'ACTIVE' },
        select: { id: true, name: true, niche: true, notes: true, facebookPageId: true, facebookAccessToken: true, facebookPageName: true },
      });

      let totalReplied = 0;

      if (activeClients.length === 0) {
        // No clients — use default page
        totalReplied = await processCommentsForPage(socialService, '[Default]');
      } else {
        for (const client of activeClients) {
          try {
            // Build SocialService for this client
            let clientSocial: SocialService;
            if (client.facebookPageId && client.facebookAccessToken) {
              clientSocial = new SocialService({ pageId: client.facebookPageId, accessToken: client.facebookAccessToken });
            } else {
              clientSocial = socialService; // fallback to env vars
            }

            // Build comment context with signup link for Federal
            const signupLink = extractSignupLink(client.niche);
            const commentCtx: CommentClientContext = {
              pageName: client.facebookPageName || client.name,
              niche: client.niche || undefined,
              notes: client.notes || undefined,
              signupLink,
            };

            const replied = await processCommentsForPage(clientSocial, `[${client.name}]`, commentCtx, client.id);
            totalReplied += replied;
          } catch (clientErr: any) {
            await agentLog('Comment Responder', `[${client.name}] ❌ Erro: ${clientErr.message}`, { type: 'error' });
          }
        }
      }

      if (totalReplied === 0) {
        await agentLog('Comment Responder', 'Nenhum comentário novo para responder.', { type: 'info' });
      } else {
        await agentLog('Comment Responder', `✅ ${totalReplied} comentários respondidos no total.`, { type: 'result' });
      }
    } catch (err: any) {
      console.error('[Comments] Erro:', err.message);
      await agentLog('Comment Responder', `❌ Erro: ${err.message}`, { type: 'error' });
    }
    }); // trackAgentExecution
  });

  console.log('[Comments] Comment responder MULTI-PAGE iniciado (verificação a cada 30 minutos)');
}

// Metrics analysis — weekly on Mondays 08:00 (was daily — saves LLM tokens)
export function startMetricsAnalyzer() {
  cron.schedule('30 8 * * 1', async () => {
    await trackAgentExecution('metrics-collector', async () => {
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
          engagementScore: report.engagementScore || null,
          commercialScore: report.commercialScore || null,
          riskScore: report.riskScore || null,
          rawData: { pageInfo, insights },
        },
      });

      await agentLog('Metrics Analyzer', `📊 Relatório gerado. Score de crescimento: ${report.growthScore}/10. Enviando insights para Content Strategist...`, { type: 'result', to: 'Content Strategist', payload: { growthScore: report.growthScore, summary: report.summary } });
    } catch (err: any) {
      console.error('[Metrics] Erro:', err.message);
      await agentLog('Metrics Analyzer', `❌ Erro ao analisar métricas: ${err.message}`, { type: 'error' });
    }
    }); // trackAgentExecution
  });

  console.log('[Metrics] Metrics analyzer iniciado (roda todo dia às 08:00)');
}

function startDueDateNotifier() {
  cron.schedule('5 8 * * *', async () => {
    await trackAgentExecution('deadline-notifier', async () => {
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
    }); // trackAgentExecution
  });

  console.log('[DueDate] Verificador de prazos iniciado (roda todo dia às 08:00)');
}

// Generate posts for a single client (or default page if no client)
export async function generatePostsForClient(clientCtx?: { clientId: string; clientName: string; niche: string; facebookPageName?: string; notes?: string }, targetDate?: Date, sharedBatchTopics?: string[]): Promise<string[]> {
  const label = clientCtx ? `[${clientCtx.clientName}]` : '[Default]';

  await agentLog('Autonomous Engine', `${label} Solicitando estratégia diária ao Content Strategist...`, { type: 'communication', to: 'Content Strategist' });
  const strategy = await buildDailyStrategy(clientCtx ? {
    clientId: clientCtx.clientId,
    clientName: clientCtx.clientName,
    niche: clientCtx.niche,
    facebookPageName: clientCtx.facebookPageName,
    notes: clientCtx.notes,
  } : undefined);

  await agentLog('Content Strategist', `${label} Estratégia pronta: ${strategy.postsToCreate} posts — ${strategy.reasoning}`, { type: 'result', to: 'Autonomous Engine', payload: { postsToCreate: strategy.postsToCreate, topics: strategy.topics } });

  // Get recent topics for THIS client (anti-duplication per client) — expanded window
  const recentWhere: any = { status: 'PUBLISHED' };
  if (clientCtx) recentWhere.clientId = clientCtx.clientId;
  const recentPosts = await prisma.scheduledPost.findMany({
    where: recentWhere,
    orderBy: { publishedAt: 'desc' },
    take: 100,
    select: { topic: true },
  });
  const recentTopics = recentPosts.map((p) => p.topic).filter(Boolean) as string[];

  // FIX: Also load topics from ALL clients scheduled TODAY to prevent cross-client duplicates
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const crossClientPosts = await prisma.scheduledPost.findMany({
    where: {
      createdAt: { gte: todayStart },
      status: { in: ['PENDING', 'APPROVED', 'PUBLISHED'] },
      ...(clientCtx ? { clientId: { not: clientCtx.clientId } } : {}),
    },
    select: { topic: true },
  });
  const crossClientTopics = crossClientPosts.map((p) => p.topic).filter(Boolean) as string[];
  recentTopics.push(...crossClientTopics);

  // Use targetDate if provided (Content Engine v2 passes tomorrow's date)
  const today = targetDate || new Date();
  const scheduledIds: string[] = [];

  // Track topics generated in THIS batch AND across clients to prevent duplicates
  // If sharedBatchTopics is provided (from engine), topics are shared across all clients
  const batchTopics: string[] = sharedBatchTopics || [];
  const normalizeForComparison = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();

  for (let i = 0; i < strategy.postsToCreate; i++) {
    try {
      const topic = strategy.topics[i];
      const focusType = strategy.focusType[i] || 'educativo';
      const timeStr = strategy.scheduledTimes[i] || '18:00';

      // PRE-CHECK 0: Skip if too similar to another topic in THIS BATCH
      const normalizedTopic = normalizeForComparison(topic);
      const isBatchDup = batchTopics.some(bt => {
        const normalizedBt = normalizeForComparison(bt);
        if (normalizedBt === normalizedTopic) return true;
        // Word overlap within batch (stricter: 50%)
        const words1 = new Set(normalizedTopic.split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(normalizedBt.split(/\s+/).filter(w => w.length > 3));
        if (words1.size < 2 || words2.size < 2) return false;
        let overlap = 0;
        for (const w of words1) { if (words2.has(w)) overlap++; }
        return overlap / Math.min(words1.size, words2.size) > 0.5;
      });
      if (isBatchDup) {
        await agentLog('Autonomous Engine', `${label} ⚠️ Tópico "${topic}" DUPLICADO no batch atual — pulando`, { type: 'info' });
        continue;
      }

      // Register topic in batch IMMEDIATELY (before any LLM calls)
      // This prevents the same topic from being processed if strategy returned duplicates
      batchTopics.push(topic);

      // PRE-CHECK 1: Skip topic if too similar to any recent topic (deterministic, no LLM)
      const topicLower = topic.toLowerCase().trim();
      const isDupTopic = recentTopics.some(rt => {
        const rtLower = rt.toLowerCase().trim();
        if (rtLower === topicLower) return true;
        // Simple word overlap check
        const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);
        const rtWords = rtLower.split(/\s+/).filter(w => w.length > 3);
        if (topicWords.length < 2 || rtWords.length < 2) return false;
        const overlap = topicWords.filter(w => rtWords.includes(w)).length;
        return overlap / Math.min(topicWords.length, rtWords.length) > 0.65;
      });
      if (isDupTopic) {
        await agentLog('Autonomous Engine', `${label} ⚠️ Tópico "${topic}" DUPLICADO — pulando (já existe em posts recentes)`, { type: 'info' });
        continue;
      }

      // Stagger between posts: 90s pause before each post (except first)
      if (i > 0) {
        await agentLog('Autonomous Engine', `${label} ⏳ Pausa de 90s entre posts (anti-rate-limit)...`, { type: 'info' });
        await new Promise(r => setTimeout(r, 90 * 1000));
      }

      await agentLog('Autonomous Engine', `${label} Solicitando post sobre "${topic}" ao Content Creator...`, { type: 'communication', to: 'Content Creator' });
      const generated = await generatePostFromStrategy(topic, focusType, recentTopics, clientCtx?.niche, clientCtx?.notes);
      await agentLog('Content Creator', `${label} Post criado: "${generated.message.substring(0, 60)}..."`, { type: 'result', to: 'Autonomous Engine' });

      // POST-LLM CHECK: verify generated.topic isn't a duplicate (LLM may return different topic than requested)
      const finalTopic = generated.topic || topic;
      if (finalTopic !== topic) {
        const normalizedFinal = normalizeForComparison(finalTopic);
        const isGeneratedDup = batchTopics.some(bt => {
          const normBt = normalizeForComparison(bt);
          if (normBt === normalizedFinal) return true;
          const w1 = new Set(normalizedFinal.split(/\s+/).filter(w => w.length > 3));
          const w2 = new Set(normBt.split(/\s+/).filter(w => w.length > 3));
          if (w1.size < 2 || w2.size < 2) return false;
          let ov = 0;
          for (const w of w1) { if (w2.has(w)) ov++; }
          return ov / Math.min(w1.size, w2.size) > 0.5;
        });
        if (isGeneratedDup) {
          await agentLog('Autonomous Engine', `${label} ⚠️ LLM retornou tópico "${finalTopic.substring(0, 50)}" que é DUPLICADO — pulando`, { type: 'info' });
          continue;
        }
        // Track the actual generated topic too
        batchTopics.push(finalTopic);
      }

      // Viral Mechanics Lab: enhance post before scheduling
      let viralScore: number | null = null;
      let viralEnhancements: any = null;
      try {
        await agentLog('Autonomous Engine', `${label} Aplicando Viral Mechanics em "${topic}"...`, { type: 'communication', to: 'Viral Mechanics' });
        const enhanced = await enhanceWithViralMechanics(generated.message, topic, focusType);
        // Always apply viral mechanics — all 5 layers are mandatory
        generated.message = enhanced.enhancedMessage;
        viralScore = enhanced.viralScore;
        viralEnhancements = {
          techniques: enhanced.appliedTechniques,
          hookType: enhanced.hookType,
          emotionalTrigger: enhanced.emotionalTrigger,
        };
        await agentLog('Viral Mechanics', `${label} Post enhanced: score ${enhanced.viralScore}/10, hook: ${enhanced.hookType}`, { type: 'result', to: 'Autonomous Engine' });
      } catch (viralErr: any) {
        // Viral mechanics failed — set conservative score so Governor reviews more carefully
        viralScore = 5;
        await agentLog('Viral Mechanics', `${label} ⚠️ Enhancement falhou (viralScore=5 fallback): ${viralErr.message}`, { type: 'error' });
      }

      // Platform Optimizer: adjust post for Facebook rules
      try {
        const optimized = optimizeForPlatform(generated.message, generated.hashtags || [], 'facebook');
        generated.message = optimized.message;
        generated.hashtags = optimized.hashtags;
        if (optimized.adjustments.length > 0 && optimized.adjustments[0] !== 'Nenhum ajuste necessário') {
          await agentLog('Platform Optimizer', `${label} Ajustes: ${optimized.adjustments.join(', ')}`, { type: 'info' });
        }
      } catch (optErr: any) {
        await agentLog('Platform Optimizer', `${label} ⚠️ Falha: ${optErr.message}`, { type: 'error' });
      }

      // Carousel Generator: auto-generate carousel for autoridade/educativo posts
      let carouselData: any = null;
      if (generated.structure && shouldGenerateCarousel(generated.contentCategory, generated.structure)) {
        try {
          carouselData = generateCarouselFromStructure(generated.structure, topic);
          await agentLog('Carousel Generator', `${label} Carrossel gerado: ${carouselData.slideCount} slides para "${topic}"`, { type: 'result' });
        } catch (carErr: any) {
          await agentLog('Carousel Generator', `${label} ⚠️ Falha: ${carErr.message}`, { type: 'error' });
        }
      }

      // Generate UNIQUE AI image — only for niche clients (Federal/NFT). Newplay posts are text-only.
      let imageUrl: string | null = null;
      let imagePrompt: string | null = null;
      const nicheConf = clientCtx?.niche ? findNicheConfig(clientCtx.niche) : null;
      if (nicheConf) {
        try {
          await agentLog('Autonomous Engine', `${label} Gerando imagem AI única para "${topic}"...`, { type: 'communication', to: 'Image Generator' });
          const image = await generateImageForPost(topic, focusType, generated.message, clientCtx?.clientId, 'feed');
          imageUrl = image.url || null;
          imagePrompt = image.prompt || null;
          await agentLog('Image Generator', `${label} Imagem AI única gerada (${image.source}) para "${topic}"`, { type: 'result', to: 'Autonomous Engine' });
        } catch (imgErr: any) {
          await agentLog('Image Generator', `${label} ⚠️ Falha ao gerar imagem: ${imgErr.message}. Post será publicado sem imagem.`, { type: 'error' });
        }
      }

      const [hours, minutes] = timeStr.split(':').map(Number);
      const scheduledFor = new Date(today);
      scheduledFor.setHours(hours, minutes, 0, 0);

      const hashtagsStr = generated.hashtags
        ? generated.hashtags.map((h: string) => `#${h.replace('#', '')}`).join(' ')
        : null;

      // ALL posts are video — video-only strategy (NO static images)
      // Video generation is DEFERRED until after Governor approves (saves resources)
      const postContentType = 'video';

      const saved = await prisma.scheduledPost.create({
        data: {
          topic: generated.topic || topic,
          message: generated.message,
          hashtags: hashtagsStr,
          imageUrl,
          imagePrompt,
          status: 'PENDING',
          source: 'autonomous-engine',
          contentType: postContentType,
          scheduledFor,
          viralScore,
          viralEnhancements,
          ...(carouselData ? { carouselData } : {}),
          ...(clientCtx ? { clientId: clientCtx.clientId } : {}),
        },
      });

      // Record topic usage in research memory (fire-and-forget)
      try {
        const { recordTopicUsage } = await import('../services/research-intelligence.service');
        recordTopicUsage(generated.topic || topic);
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }

      // NOTE: Video generation is NO LONGER queued here.
      // Videos are generated on-demand when the Scheduler is about to publish an APPROVED video post.
      // This avoids wasting resources on posts that may be rejected by the Governor.

      scheduledIds.push(saved.id);
      recentTopics.push(topic);
      // batchTopics.push already done immediately after dedup check (line ~861)
      await agentLog('Autonomous Engine', `${label} 📅 Post ${i + 1}/${strategy.postsToCreate} agendado: "${topic}" para as ${timeStr}`, { type: 'action', to: 'Scheduler' });

      // Hashtag Intelligence: record usage for learning
      try {
        if (generated.hashtags && generated.hashtags.length > 0) {
          await recordHashtagUsage(saved.id, generated.hashtags, focusType);
        }
      } catch { /* non-blocking */ }

      // Content Atomization: 1 post → 5 formats (ZERO tokens)
      // Generates: carousel, video slides, thread, ad copy — all from existing text
      try {
        const atomized = atomizePost(generated.message, topic, generated.structure || null);

        // Save carousel replica
        await prisma.contentReplica.create({
          data: {
            originalPostId: saved.id,
            format: 'carousel',
            platform: 'instagram',
            content: atomized.carousel.caption,
            slides: atomized.carousel.slides as any,
            metadata: { slideCount: atomized.carousel.slides.length },
            status: 'READY',
          },
        });

        // Save thread replica (publishable as multiple Facebook posts)
        await prisma.contentReplica.create({
          data: {
            originalPostId: saved.id,
            format: 'thread',
            platform: 'facebook',
            content: atomized.thread.posts.join('\n\n'),
            metadata: { postCount: atomized.thread.posts.length, posts: atomized.thread.posts },
            status: 'READY',
          },
        });

        // Save ad copy replica
        await prisma.contentReplica.create({
          data: {
            originalPostId: saved.id,
            format: 'ad_copy',
            platform: 'facebook',
            content: atomized.adCopy.primaryText,
            metadata: atomized.adCopy as any,
            status: 'READY',
          },
        });

        // Save video script replica (slides for video generation)
        await prisma.contentReplica.create({
          data: {
            originalPostId: saved.id,
            format: 'video_script',
            platform: 'facebook',
            content: `${atomized.video.hook} | ${atomized.video.value} | ${atomized.video.cta}`,
            metadata: atomized.video as any,
            status: 'READY',
          },
        });

        await agentLog('Content Atomizer', `${label} 1→5 atomizado: carousel + thread + ad + video para "${topic}" (0 tokens)`, { type: 'result' });
      } catch (atomErr: any) {
        // Non-blocking — atomization failure doesn't affect main post
        console.error(`[Atomizer] Failed for post ${saved.id}: ${atomErr.message}`);
      }

      // A/B Testing: create variant B for non-video posts
      if (postContentType !== 'video') {
        try {
          let abEnabled = false;
          try {
            const aggConfig = await prisma.systemConfig.findUnique({ where: { key: 'aggressive_growth_mode' } });
            const isAggressive = aggConfig?.value === true || (aggConfig?.value as any)?.enabled === true;
            abEnabled = isAggressive || Math.random() < 0.5;
          } catch { abEnabled = Math.random() < 0.5; }

          if (abEnabled) {
            await agentLog('Autonomous Engine', `${label} Criando variante A/B para "${topic}"...`, { type: 'communication', to: 'A/B Testing' });
            await createABVariant({
              id: saved.id,
              topic: generated.topic || topic,
              contentType: postContentType,
              scheduledFor,
              viralScore,
              message: generated.message,
            });
          }
        } catch (abErr: any) {
          await agentLog('A/B Testing', `${label} ⚠️ Falha ao criar variante: ${abErr.message}`, { type: 'error' });
        }
      }
    } catch (err: any) {
      await agentLog('Autonomous Engine', `${label} ❌ Erro ao gerar post ${i + 1}: ${err.message}`, { type: 'error' });
    }
  }

  return scheduledIds;
}

// Motor autônomo: roda todo dia às 07:00 e agenda posts do dia PARA CADA CLIENT ATIVO
export function startAutonomousContentEngine() {
  // ═══════════════════════════════════════════════════════════════════
  // CONTENT ENGINE v2 — 24H ADVANCE GENERATION + STAGGERED LLM CALLS
  //
  // Strategy: Generate TOMORROW's content starting at 01:00 AM.
  // Each client runs sequentially with 2-min pauses between LLM calls.
  // This avoids rate limits by spreading ~50 calls over ~2 hours (01:00-03:00).
  //
  // Timeline:
  //  01:00 — Start generating tomorrow's posts (Client 1 strategy)
  //  01:05 — Client 1 post 1 (creator + viral + image)
  //  01:10 — Client 1 post 2
  //  ...
  //  01:30 — Client 2 strategy
  //  01:35 — Client 2 post 1
  //  ...
  //  ~02:30 — All posts generated for tomorrow
  //  07:25 — Governor reviews all posts (30min cycle catches them)
  //  08:30+ — Scheduler publishes approved posts at scheduled times
  // ═══════════════════════════════════════════════════════════════════

  // Stagger delay between LLM-heavy operations (in ms)
  const STAGGER_BETWEEN_CLIENTS_MS = 5 * 60 * 1000; // 5 minutes between clients

  cron.schedule('0 1 * * *', async () => {
    await trackAgentExecution('content-engine', async () => {
    // Calculate TOMORROW's date for scheduling
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    await agentLog('Autonomous Engine', `🌙 Gerando conteúdo para AMANHÃ (${tomorrowStr}) — modo escalonado anti-rate-limit...`, { type: 'action' });
    try {
      const activeClients = await prisma.client.findMany({
        where: { isActive: true, status: 'ACTIVE' },
        select: { id: true, name: true, niche: true, notes: true, facebookPageName: true, facebookPageId: true, facebookAccessToken: true },
      });

      let totalScheduled = 0;
      const clientSummaries: string[] = [];
      // Shared across ALL clients — prevents cross-client topic duplication
      const sharedBatchTopics: string[] = [];

      if (activeClients.length === 0) {
        await agentLog('Autonomous Engine', 'Nenhum client ativo — rodando para página padrão (env vars)', { type: 'info' });
        const ids = await generatePostsForClient(undefined, tomorrow, sharedBatchTopics);
        totalScheduled = ids.length;
        clientSummaries.push(`Default: ${ids.length} posts`);
      } else {
        for (const client of activeClients) {
          try {
            const hasOwnPage = client.facebookPageId && client.facebookAccessToken;
            const hasEnvFallback = process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_ACCESS_TOKEN;
            if (!hasOwnPage && !hasEnvFallback) {
              await agentLog('Autonomous Engine', `⚠️ ${client.name}: sem page config. Pulando.`, { type: 'info' });
              continue;
            }

            const clientLabel = client.facebookPageName || client.name.substring(0, 50);
            await agentLog('Autonomous Engine', `--- [${clientLabel}] Gerando conteúdo para amanhã ---`, { type: 'action' });

            // Wait before starting each client to avoid burst
            if (totalScheduled > 0) {
              await agentLog('Autonomous Engine', `⏳ Aguardando ${STAGGER_BETWEEN_CLIENTS_MS / 1000}s antes do próximo client...`, { type: 'info' });
              await new Promise(r => setTimeout(r, STAGGER_BETWEEN_CLIENTS_MS));
            }

            const ids = await generatePostsForClient({
              clientId: client.id,
              clientName: clientLabel,
              niche: client.niche || 'geral',
              facebookPageName: client.facebookPageName || undefined,
              notes: client.notes || undefined,
            }, tomorrow, sharedBatchTopics);
            totalScheduled += ids.length;
            clientSummaries.push(`${clientLabel}: ${ids.length} posts`);
          } catch (clientErr: any) {
            const clientLabel = client.facebookPageName || client.name.substring(0, 50);
            await agentLog('Autonomous Engine', `❌ Erro ao gerar conteúdo para ${clientLabel}: ${clientErr.message}`, { type: 'error' });
            clientSummaries.push(`${clientLabel}: ERRO`);
          }
        }
      }

      if (totalScheduled > 0) {
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
        const summary = clientSummaries.join(' | ');
        for (const admin of admins) {
          await notificationsService.createAndEmit(admin.id, 'TASK_ASSIGNED', `Conteúdo de amanhã pronto!`, `${totalScheduled} posts agendados para amanhã: ${summary}`);
        }
      }

      await agentLog('Autonomous Engine', `✅ Conteúdo de amanhã pronto! ${totalScheduled} posts. ${clientSummaries.join(' | ')}`, { type: 'result' });
    } catch (err: any) {
      console.error('[Engine] Erro no ciclo autônomo:', err.message);
      await agentLog('Autonomous Engine', `❌ Erro no ciclo autônomo: ${err.message}`, { type: 'error' });
    }
    }); // trackAgentExecution
  });

  console.log('[Engine] Motor autônomo v2 iniciado — gera conteúdo de AMANHÃ às 01:00 (escalonado)');
}

// Roda toda segunda-feira às 6h: analisa tendências e notifica admins
export function startTrendingTopicsAgent() {
  cron.schedule('0 6 * * 1', async () => {
    await trackAgentExecution('trending-topics', async () => {
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
    }); // trackAgentExecution
  });

  console.log('[Trending] Agente de tendências iniciado (roda toda segunda às 06:00)');
}

// Roda todo dia às 10h e 15h: orquestra posts de produtos TikTok Shop
export function startProductOrchestrator() {
  // DISABLED — wastes LLM tokens on TikTok product research + copywriting
  // Re-enable when we have paid LLM tier
  console.log('[Products] DISABLED — token savings mode');
  return;
  cron.schedule('0 10,15 * * *', async () => {
    await trackAgentExecution('tiktok-products', async () => {
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
    }); // trackAgentExecution
  });

  console.log('[Products] Orquestrador de produtos iniciado (roda às 10:00 e 15:00)');
}

// Verifica token do Facebook todo dia às 9h
export function startTokenMonitor() {
  cron.schedule('0 9 * * *', async () => {
    await trackAgentExecution('token-monitor', async () => {
    try {
      await agentLog('Token Monitor', '🔑 Verificando validade do token do Facebook...', { type: 'action', to: 'Facebook API' });
      await runTokenMonitor();
      await agentLog('Token Monitor', '✅ Token do Facebook verificado com sucesso.', { type: 'result' });
    } catch (err: any) {
      console.error('[TokenMonitor] Erro:', err.message);
      await agentLog('Token Monitor', `❌ Problema com token do Facebook: ${err.message}`, { type: 'error' });
    }
    }); // trackAgentExecution
  });

  // FIX #3: Restore persisted long-lived token on startup, then run monitor
  restorePersistedToken().then(() => runTokenMonitor()).catch(() => {});
  console.log('[TokenMonitor] Monitor de token iniciado (verifica todo dia às 09:00, auto-exchange enabled)');
}

export function startTikTokTokenRefresh() {
  // DISABLED — TikTok not active. Re-enable when TikTok integration is set up.
  console.log('[TikTokTokenRefresh] DISABLED — TikTok not active');
  return;
  // TikTok token refresh DISABLED — using Buffer API now (Buffer manages its own tokens)
  // Previous: refreshed TikTok OAuth tokens every 12h
  // To re-enable direct TikTok API, uncomment and restore TikTokService imports
  console.log('[TikTokTokenRefresh] DISABLED — using Buffer API for TikTok publishing');

  console.log('[TikTokTokenRefresh] Cron iniciado (a cada 12h, tokens expirando em 24h)');
}

// ─── Quantum Feedback Training (daily 04:00 UTC — was every 6h) ───
function startQuantumTraining() {
  cron.schedule('0 4 * * *', async () => {
    try {
      console.log('[Scheduler] ⚛ Starting quantum feedback training...');
      const results = await runQuantumTraining(10);
      if (results.length > 0) {
        for (const r of results) {
          console.log(`[Scheduler] ⚛ Trained ${r.agent}::${r.decision} gen${r.generation} — avg reward: ${r.avgReward.toFixed(3)}, samples: ${r.samplesUsed}, source: ${r.source}`);
        }
        await agentLog('Quantum Feedback', `Training complete: ${results.length} models updated`, { type: 'info' });
      }
      const stats = await getTrainingStats();
      console.log(`[Scheduler] ⚛ Quantum stats: ${stats.totalDecisions} decisions, ${stats.withReward} with reward, ${stats.trainedModels} models`);
    } catch (err: any) {
      console.error(`[Scheduler] Quantum training error: ${err.message}`);
    }
  });
}

// ─── Stale Data Cleanup (daily 02:00) ───
function startStaleDataCleanup() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      let totalCleaned = 0;

      // ── 1. Posts that will never publish ──

      // PENDING never approved (>48h)
      const stalePending = await prisma.scheduledPost.deleteMany({
        where: { status: 'PENDING', governorDecision: null, createdAt: { lt: fortyEightHoursAgo } },
      });
      totalCleaned += stalePending.count;

      // FAILED posts (>3 days)
      const staleFailed = await prisma.scheduledPost.deleteMany({
        where: { status: 'FAILED', updatedAt: { lt: threeDaysAgo } },
      });
      totalCleaned += staleFailed.count;

      // REJECTED posts (>3 days)
      const staleRejected = await prisma.scheduledPost.deleteMany({
        where: { status: 'REJECTED', updatedAt: { lt: threeDaysAgo } },
      });
      totalCleaned += staleRejected.count;

      // PENDING_VIDEO stuck (>48h — video generation failed permanently)
      const stalePendingVideo = await prisma.scheduledPost.deleteMany({
        where: { status: 'PENDING_VIDEO', createdAt: { lt: fortyEightHoursAgo } },
      });
      totalCleaned += stalePendingVideo.count;

      // APPROVED but never published (>7 days — stale content)
      const staleApproved = await prisma.scheduledPost.deleteMany({
        where: { status: 'APPROVED', createdAt: { lt: sevenDaysAgo } },
      });
      totalCleaned += staleApproved.count;

      // Old PUBLISHED posts (>30 days — keep recent for analytics)
      const oldPublished = await prisma.scheduledPost.deleteMany({
        where: { status: 'PUBLISHED', publishedAt: { lt: thirtyDaysAgo } },
      });
      totalCleaned += oldPublished.count;

      // ── 2. Orphan content replicas ──
      const allPostIds = (await prisma.scheduledPost.findMany({ select: { id: true } })).map(p => p.id);
      let orphanReplicas = { count: 0 };
      try {
        if (allPostIds.length > 0) {
          orphanReplicas = await prisma.contentReplica.deleteMany({
            where: { originalPostId: { notIn: allPostIds } },
          });
        } else {
          orphanReplicas = await prisma.contentReplica.deleteMany({});
        }
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += orphanReplicas.count;

      // Old replicas (>7 days)
      let oldReplicas = { count: 0 };
      try {
        oldReplicas = await prisma.contentReplica.deleteMany({
          where: { createdAt: { lt: sevenDaysAgo } },
        });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += oldReplicas.count;

      // ── 3. Logs (biggest table — grows fast) ──
      let oldLogs = { count: 0 };
      try {
        oldLogs = await prisma.agentLog.deleteMany({
          where: { createdAt: { lt: threeDaysAgo } },
        });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += oldLogs.count;

      // ── 4. Notifications (>7 days) ──
      let oldNotifs = { count: 0 };
      try {
        oldNotifs = await prisma.notification.deleteMany({
          where: { createdAt: { lt: sevenDaysAgo } },
        });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += oldNotifs.count;

      // ── 5. Evolution Engine personal notes ──
      let oldNotes = { count: 0 };
      try {
        oldNotes = await prisma.personalNote.deleteMany({
          where: { content: { startsWith: '[Evolution Engine]' }, createdAt: { lt: sevenDaysAgo } },
        });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += oldNotes.count;

      // ── 6. Research memory (>90 days) ──
      let staleResearch = { count: 0 };
      try {
        staleResearch = await prisma.researchMemory.deleteMany({
          where: { createdAt: { lt: ninetyDaysAgo } },
        });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += staleResearch.count;

      // ── 7. Expired trending cache ──
      let expiredTrending = { count: 0 };
      try {
        expiredTrending = await prisma.trendingCache.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += expiredTrending.count;

      // ── 8. Old strategic reports (keep last 3) ──
      let oldReports = { count: 0 };
      try {
        const reports = await prisma.strategicReport.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true } });
        if (reports.length > 3) {
          const toDelete = reports.slice(3).map(r => r.id);
          oldReports = await prisma.strategicReport.deleteMany({ where: { id: { in: toDelete } } });
        }
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += oldReports.count;

      // ── 9. Old search cache (>7 days) ──
      let oldSearch = { count: 0 };
      try {
        oldSearch = await prisma.searchCache.deleteMany({ where: { createdAt: { lt: sevenDaysAgo } } });
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
      totalCleaned += oldSearch.count;

      // ── 10. VACUUM to reclaim disk space ──
      try {
        await prisma.$executeRawUnsafe('VACUUM agent_logs');
        await prisma.$executeRawUnsafe('VACUUM scheduled_posts');
        await prisma.$executeRawUnsafe('VACUUM content_replicas');
        await prisma.$executeRawUnsafe('VACUUM notifications');
        await prisma.$executeRawUnsafe('VACUUM personal_notes');
      } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }

      // ── Summary ──
      if (totalCleaned > 0) {
        const summary = [
          stalePending.count && `${stalePending.count} pending`,
          staleFailed.count && `${staleFailed.count} failed`,
          staleRejected.count && `${staleRejected.count} rejected`,
          stalePendingVideo.count && `${stalePendingVideo.count} stuck_video`,
          staleApproved.count && `${staleApproved.count} stale_approved`,
          oldPublished.count && `${oldPublished.count} old_published`,
          orphanReplicas.count && `${orphanReplicas.count} orphan_replicas`,
          oldReplicas.count && `${oldReplicas.count} old_replicas`,
          oldLogs.count && `${oldLogs.count} logs`,
          oldNotifs.count && `${oldNotifs.count} notifications`,
          oldNotes.count && `${oldNotes.count} evo_notes`,
          staleResearch.count && `${staleResearch.count} research`,
          expiredTrending.count && `${expiredTrending.count} trending`,
          oldReports.count && `${oldReports.count} reports`,
          oldSearch.count && `${oldSearch.count} search_cache`,
        ].filter(Boolean).join(', ');

        await agentLog('Cleanup', `🧹 Daily cleanup: ${totalCleaned} items removed (${summary}) + VACUUM`, { type: 'result' });
        console.log(`[Cleanup] 🧹 ${totalCleaned} items removed: ${summary}`);
      } else {
        console.log('[Cleanup] Nothing to clean');
      }
    } catch (err: any) {
      console.error('[Cleanup] Error:', err.message);
    }
  });
  console.log('[Cleanup] Auto-cleanup started (daily 02:00 — posts, logs, replicas, VACUUM)');
}

// Agents disabled to save RAM — can be re-enabled by removing from this set
// Ultra-lean mode: only Scheduler, Governor, Shopee, Comments, TokenMonitor, Cleanup
const DISABLED_AGENTS = new Set([
  'ab-testing',
  'evolution-engine',
  'strategic-command',
  'strategic-engine',
  'growth-director',
  'reputation-monitor',
  'trending-topics',
  'performance-learner',
  'niche-learning',
  'lead-capture',
  'lead-nurture',
  'tiktok-recycler',
  'tiktok-content-factory',
  'tiktok-token-refresh',
  'tiktok-products',
  'short-video-engine',
  'quantum-training',
  'growth-analyst',
  'content-engine',       // autonomous content — not needed (Shopee handles posts)
  'metrics-collector',    // metrics dashboard — nobody watching
  'deadline-notifier',    // due date alerts — no active tasks
  'system-sentinel',      // health monitor — overkill for 2 clients
  'content-governor',     // quality review 1x/hour — overkill, Shopee agent already generates quality posts
  'token-monitor',        // FB token check 1x/day — tokens last 60 days, manual check is enough
  'comment-responder',    // LLM-heavy (1 call/comment + sentiment) — saves quota, 2 clients = few comments
]);

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
  'strategic-command': startStrategicCommandAgent,
  'niche-learning': startNicheLearningAgent,
  'strategic-engine': startStrategicEngine,
  'evolution-engine': startEvolutionEngine,
  'short-video-engine': startShortVideoEngine,
  'growth-analyst': startGrowthAnalyst,
  'lead-nurture': startLeadNurtureAgent,
  'tiktok-recycler': startTikTokRecycler,
  'tiktok-content-factory': startTikTokContentFactory,
  'tiktok-token-refresh': startTikTokTokenRefresh,
  'stale-data-cleanup': startStaleDataCleanup,
  'quantum-training': startQuantumTraining,
  'shopee-affiliate': startShopeeAffiliateAgent,
};

export async function updateLastRun(agentName: string): Promise<void> {
  try {
    await prisma.agent.updateMany({
      where: { OR: [{ name: agentName }, { function: agentName }] },
      data: { lastRunAt: new Date() },
    });
  } catch (err: any) { await agentError('Scheduler', 'agent operation', err, 'low').catch(() => {}); }
}

// Render queue cleanup removed — using local _make-videos.js pipeline

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
      let skipped = 0;
      for (const agent of activeAgents) {
        if (DISABLED_AGENTS.has(agent.function)) { skipped++; continue; }
        const fn = AGENT_FUNCTION_MAP[agent.function];
        if (fn) {
          // Stagger agent starts with random jitter (0-60s) to avoid spike
          const jitterMs = Math.floor(Math.random() * 60000);
          setTimeout(() => fn(), jitterMs);
          started++;
        }
      }
      console.log(`[Agents] ${started}/${activeAgents.length} cron agents started from DB (${skipped} disabled for RAM savings)`);

      // Start any agents in AGENT_FUNCTION_MAP that are NOT yet in DB (newly added)
      const dbFunctions = new Set(activeAgents.map(a => a.function));
      let extras = 0;
      for (const [key, fn] of Object.entries(AGENT_FUNCTION_MAP)) {
        if (DISABLED_AGENTS.has(key)) continue;
        if (!dbFunctions.has(key)) {
          const jitterMs = Math.floor(Math.random() * 60000);
          setTimeout(() => fn(), jitterMs);
          extras++;
        }
      }
      if (extras > 0) console.log(`[Agents] ${extras} new agent(s) started (not yet in DB)`);
    }
  } catch {
    // DB not ready or agents table doesn't exist yet — fall back to hardcoded
  }

  // Fallback: start all if DB didn't provide agents
  if (!startedFromDB) {
    const fns = Object.values(AGENT_FUNCTION_MAP);
    fns.forEach((fn, i) => {
      // Stagger agent starts with jitter to avoid simultaneous boot spike
      setTimeout(() => fn(), i * 2000 + Math.floor(Math.random() * 5000));
    });
    console.log(`[Agents] ${fns.length} agents started (hardcoded fallback, staggered)`);
  }

  // Seed brand config on startup
  seedBrandConfig().catch(() => {});

  // Render queue cleanup removed

  agentLog('Sistema', `All agents started (DB-driven: ${startedFromDB}).`, { type: 'info' }).catch(() => {});
  console.log('[Agents] Todos os agentes iniciados ✓');
}
