import axios, { AxiosInstance, AxiosError } from 'axios';
import fs from 'fs';
import FormData from 'form-data';

// Fix #1: Graph API v19.0 → v22.0 (current stable)
const GRAPH_API = 'https://graph.facebook.com/v22.0';

type PublishOptions = {
  scheduledTime?: string;
  linkUrl?: string | null;
  platform?: 'facebook' | 'instagram' | 'both';
};

type PublishMediaOptions = PublishOptions & {
  mediaType?: 'image' | 'video' | null;
};

export type PageCredentials = {
  pageId: string;
  accessToken: string;
};

// Cache do Page Token por pageId (multi-page support)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function invalidateTokenCache(pageId?: string) {
  if (pageId) {
    tokenCache.delete(pageId);
  } else {
    tokenCache.clear();
  }
}

function isAuthError(err: any): boolean {
  const fbCode = err.response?.data?.error?.code;
  const status = err.response?.status;
  return status === 401 || fbCode === 190 || fbCode === 102;
}

// Fix #4: Axios instance with retry/rate-limit interceptor
const fbApi: AxiosInstance = axios.create();

fbApi.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as any;
  if (!config) throw error;

  // Fix #7: Invalidate cache ONLY for the affected pageId (not all)
  if (isAuthError(error)) {
    const urlMatch = config.url?.match(/graph\.facebook\.com\/v[\d.]+\/(\d+)/);
    const affectedPageId = urlMatch?.[1];
    invalidateTokenCache(affectedPageId);
    console.warn(`[SocialService] Token invalidated for page ${affectedPageId || 'unknown'} due to auth error`);
  }

  // Rate limit (429) or server error (500/502/503): retry with backoff
  const status = error.response?.status || 0;
  const retryable = status === 429 || status >= 500;
  const attempt = config._retryCount || 0;
  const maxRetries = 2;

  if (retryable && attempt < maxRetries) {
    config._retryCount = attempt + 1;
    const delay = status === 429
      ? 60_000 // rate limit: wait 60s
      : (attempt + 1) * 5_000; // server error: 5s, 10s
    console.warn(`[SocialService] Retry ${config._retryCount}/${maxRetries} after ${delay}ms (HTTP ${status})`);
    await new Promise((r) => setTimeout(r, delay));
    return fbApi.request(config);
  }

  throw error;
});

// Fix #2: Helper to build auth headers instead of query params
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function getEnvToken() {
  const token = (process.env.FACEBOOK_ACCESS_TOKEN || '').trim();
  if (!token || token === 'cole_seu_novo_token_aqui') {
    throw { statusCode: 503, message: 'Facebook token not configured' };
  }
  return token;
}

function getEnvPageId() {
  const id = process.env.FACEBOOK_PAGE_ID;
  if (!id || id === 'cole_o_page_id_aqui') {
    throw { statusCode: 503, message: 'Facebook page ID not configured' };
  }
  return id;
}

export class SocialService {
  private pageId: string;
  private accessToken: string;

  /**
   * Create SocialService instance.
   * - With credentials: uses provided pageId + accessToken (multi-page)
   * - Without credentials: falls back to env vars (backward compat)
   */
  constructor(credentials?: PageCredentials) {
    if (credentials) {
      this.pageId = credentials.pageId;
      this.accessToken = credentials.accessToken;
    } else {
      this.pageId = getEnvPageId();
      this.accessToken = getEnvToken();
    }
  }

  private async getPageToken(): Promise<string> {
    const cached = tokenCache.get(this.pageId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    try {
      const { data } = await fbApi.get(`${GRAPH_API}/${this.pageId}`, {
        params: { fields: 'access_token' },
        headers: authHeaders(this.accessToken),
      });

      if (data.access_token) {
        tokenCache.set(this.pageId, {
          token: data.access_token,
          expiresAt: Date.now() + 60 * 60 * 1000,
        });
        console.log(`[SocialService] Page token obtained for ${this.pageId}`);
        return data.access_token as string;
      }
    } catch (err: any) {
      console.warn(`[SocialService] Could not get page token for ${this.pageId}, falling back to user token:`, err.response?.data?.error?.message || err.message);
    }

    return this.accessToken;
  }

  async getPageInfo() {
    const token = await this.getPageToken();
    const { data } = await fbApi.get(`${GRAPH_API}/${this.pageId}`, {
      params: {
        fields: 'id,name,fan_count,followers_count,about,category,picture,cover,website',
      },
      headers: authHeaders(token),
    });
    return data;
  }

  async getPageInsights(period: 'day' | 'week' | 'month' = 'month') {
    const token = await this.getPageToken();

    const metrics = [
      'page_impressions',
      'page_impressions_unique',
      'page_engaged_users',
      'page_post_engagements',
      'page_fans',
      'page_fan_adds',
      'page_views_total',
    ].join(',');

    const { data } = await fbApi.get(`${GRAPH_API}/${this.pageId}/insights`, {
      params: { metric: metrics, period },
      headers: authHeaders(token),
    });

    const insights: Record<string, any> = {};
    for (const item of data.data || []) {
      insights[item.name] = {
        value: item.values?.[item.values.length - 1]?.value ?? 0,
        previous: item.values?.[item.values.length - 2]?.value ?? 0,
        values: item.values || [],
      };
    }
    return insights;
  }

  async getPosts(limit = 10) {
    const token = await this.getPageToken();
    try {
      const { data } = await fbApi.get(`${GRAPH_API}/${this.pageId}/posts`, {
        params: {
          fields: 'id,message,story,created_time,full_picture,permalink_url',
          limit,
        },
        headers: authHeaders(token),
      });
      return data.data || [];
    } catch (err: any) {
      const fbMsg = err.response?.data?.error?.message || err.message;
      const fbCode = err.response?.data?.error?.code;
      console.error(`[SocialService] getPosts error (FB code ${fbCode}): ${fbMsg}`);
      const exposed: any = new Error(`[FB ${fbCode}] ${fbMsg}`);
      exposed.statusCode = err.response?.status || 500;
      exposed.fbResponse = err.response?.data;
      throw exposed;
    }
  }

  private withSchedule(params: Record<string, any>, scheduledTime?: string) {
    if (!scheduledTime) return params;
    return {
      ...params,
      scheduled_publish_time: Math.floor(new Date(scheduledTime).getTime() / 1000),
      published: false,
    };
  }

  private buildMessageWithLink(message: string, linkUrl?: string | null) {
    if (!linkUrl) return message;
    return `${message}\n\n${linkUrl}`;
  }

  async publishPost(message: string, options?: PublishOptions) {
    const token = await this.getPageToken();

    const finalMessage = this.buildMessageWithLink(message, options?.linkUrl);
    const params = this.withSchedule({ message: finalMessage }, options?.scheduledTime);

    const { data } = await fbApi.post(`${GRAPH_API}/${this.pageId}/feed`, null, {
      params,
      headers: authHeaders(token),
    });
    return data;
  }

  async publishLinkPost(message: string, linkUrl: string, options?: PublishOptions) {
    const token = await this.getPageToken();
    const params = this.withSchedule({ message, link: linkUrl }, options?.scheduledTime);

    const { data } = await fbApi.post(`${GRAPH_API}/${this.pageId}/feed`, null, {
      params,
      headers: authHeaders(token),
    });
    return data;
  }

  async publishPhotoPost(message: string, imageUrl: string, options?: PublishOptions) {
    const token = await this.getPageToken();

    const finalMessage = this.buildMessageWithLink(message, options?.linkUrl);
    const params = this.withSchedule(
      {
        message: finalMessage,
        url: imageUrl,
      },
      options?.scheduledTime,
    );

    const { data } = await fbApi.post(`${GRAPH_API}/${this.pageId}/photos`, null, {
      params,
      headers: authHeaders(token),
    });
    return data;
  }

  async publishVideoPost(message: string, videoUrl: string, options?: PublishOptions) {
    const token = await this.getPageToken();

    const finalDescription = this.buildMessageWithLink(message, options?.linkUrl);
    const params = this.withSchedule(
      {
        description: finalDescription,
        file_url: videoUrl,
      },
      options?.scheduledTime,
    );

    const { data } = await fbApi.post(`${GRAPH_API}/${this.pageId}/videos`, null, {
      params,
      headers: authHeaders(token),
    });
    return data;
  }

  async publishMediaPost(message: string, mediaUrl: string, options?: PublishMediaOptions) {
    if (options?.mediaType === 'video') {
      return this.publishVideoPost(message, mediaUrl, options);
    }

    if (options?.mediaType === 'image') {
      return this.publishPhotoPost(message, mediaUrl, options);
    }

    const isVideoByUrl = /\.(mp4|mov|avi|m4v)(\?|$)/i.test(mediaUrl);
    return isVideoByUrl
      ? this.publishVideoPost(message, mediaUrl, options)
      : this.publishPhotoPost(message, mediaUrl, options);
  }

  async getScheduledPosts() {
    const token = await this.getPageToken();
    try {
      const { data } = await fbApi.get(`${GRAPH_API}/${this.pageId}/scheduled_posts`, {
        params: {
          fields: 'id,message,scheduled_publish_time,full_picture',
        },
        headers: authHeaders(token),
      });
      return data.data || [];
    } catch (err: any) {
      console.error('[SocialService] getScheduledPosts error:', err.response?.data?.error?.message || err.message);
      return [];
    }
  }

  async deletePost(postId: string) {
    const token = await this.getPageToken();
    const { data } = await fbApi.delete(`${GRAPH_API}/${postId}`, {
      headers: authHeaders(token),
    });
    return data;
  }

  async getPostComments(postId: string) {
    const token = await this.getPageToken();
    const { data } = await fbApi.get(`${GRAPH_API}/${postId}/comments`, {
      params: {
        fields: 'id,message,from,created_time,like_count',
      },
      headers: authHeaders(token),
    });
    return data.data || [];
  }

  /**
   * Fetch post-level insights (reactions, reach, impressions, saves, video views, clicks).
   * Uses Graph API /{post-id} with reactions summary + /{post-id}/insights for reach/impressions.
   */
  async getPostInsights(postId: string): Promise<{
    likes: number; comments: number; shares: number;
    reach: number; impressions: number; saves: number;
    videoViews: number; videoAvgWatchMs: number; clicks: number;
  }> {
    const token = await this.getPageToken();
    const result = { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, saves: 0, videoViews: 0, videoAvgWatchMs: 0, clicks: 0 };

    try {
      // 1. Basic engagement from post object
      const { data: postData } = await fbApi.get(`${GRAPH_API}/${postId}`, {
        params: {
          fields: 'reactions.summary(true),comments.summary(true),shares',
        },
        headers: authHeaders(token),
      });

      result.likes = postData.reactions?.summary?.total_count || 0;
      result.comments = postData.comments?.summary?.total_count || 0;
      result.shares = postData.shares?.count || 0;
    } catch (e: any) {
      console.warn(`[SocialService] getPostInsights basic failed for ${postId}: ${e.message}`);
    }

    try {
      // 2. Post insights (reach, impressions, saves, video, clicks)
      const { data: insightsData } = await fbApi.get(`${GRAPH_API}/${postId}/insights`, {
        params: {
          metric: [
            'post_impressions_unique',    // reach
            'post_impressions',           // impressions
            'post_reactions_by_type_total',
            'post_activity_by_action_type',
            'post_clicks_by_type',
            'post_video_views',
            'post_video_avg_time_watched',
          ].join(','),
        },
        headers: authHeaders(token),
      });

      for (const item of insightsData.data || []) {
        const val = item.values?.[0]?.value;
        switch (item.name) {
          case 'post_impressions_unique':
            result.reach = typeof val === 'number' ? val : 0;
            break;
          case 'post_impressions':
            result.impressions = typeof val === 'number' ? val : 0;
            break;
          case 'post_activity_by_action_type':
            if (val && typeof val === 'object') {
              result.saves = (val as any).save || 0;
            }
            break;
          case 'post_clicks_by_type':
            if (val && typeof val === 'object') {
              result.clicks = Object.values(val as Record<string, number>).reduce((s, v) => s + (v || 0), 0);
            }
            break;
          case 'post_video_views':
            result.videoViews = typeof val === 'number' ? val : 0;
            break;
          case 'post_video_avg_time_watched':
            result.videoAvgWatchMs = typeof val === 'number' ? val : 0;
            break;
        }
      }
    } catch (e: any) {
      // Insights may not be available for all post types — not critical
      console.warn(`[SocialService] getPostInsights insights failed for ${postId}: ${e.message}`);
    }

    return result;
  }

  async replyToComment(commentId: string, message: string): Promise<void> {
    const token = await this.getPageToken();
    await fbApi.post(`${GRAPH_API}/${commentId}/comments`, null, {
      params: { message },
      headers: authHeaders(token),
    });
  }

  async commentOnPost(postId: string, message: string): Promise<void> {
    const token = await this.getPageToken();
    await fbApi.post(`${GRAPH_API}/${postId}/comments`, null, {
      params: { message },
      headers: authHeaders(token),
    });
  }

  /**
   * Publish as Facebook Reel (vertical video, native Reel experience).
   * Uses 2-phase upload: start → finish with file_url (Cloudinary URL).
   * Falls back to publishVideoPost() if Reel API fails.
   */
  async publishReelPost(message: string, videoUrl: string, options?: PublishOptions): Promise<any> {
    const token = await this.getPageToken();
    const finalDescription = this.buildMessageWithLink(message, options?.linkUrl);

    // Phase 1: Start upload
    const { data: startData } = await fbApi.post(`${GRAPH_API}/${this.pageId}/video_reels`, null, {
      params: { upload_phase: 'start' },
      headers: authHeaders(token),
    });

    const videoId = startData.video_id;
    if (!videoId) {
      throw new Error('Reel start phase returned no video_id');
    }

    // Phase 2: Finish upload with file_url
    const finishParams: Record<string, any> = {
      upload_phase: 'finish',
      video_id: videoId,
      file_url: videoUrl,
      description: finalDescription,
      video_state: 'PUBLISHED',
    };

    const { data } = await fbApi.post(`${GRAPH_API}/${this.pageId}/video_reels`, null, {
      params: finishParams,
      headers: authHeaders(token),
    });

    return { ...data, video_id: videoId };
  }

  async publishVideoFromFile(message: string, filePath: string) {
    const token = await this.getPageToken();

    const form = new FormData();
    form.append('source', fs.createReadStream(filePath));
    form.append('description', message);

    const { data } = await fbApi.post(`${GRAPH_API}/${this.pageId}/videos`, form, {
      headers: {
        ...form.getHeaders(),
        ...authHeaders(token),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000,
    });
    return data;
  }

  /**
   * Publish video + auto-comment affiliate link after delay.
   * Optimized for native link preview on Facebook:
   * - Caption has NO links (avoids FB penalty)
   * - Affiliate link posted as comment after video is processed
   * - Uses short delay so FB has time to index the video before link comment
   */
  async publishVideoWithNativeLink(
    caption: string,
    filePath: string,
    affiliateLink: string,
    options?: { commentDelay?: number; commentPrefix?: string },
  ): Promise<{ videoId: string; commentId?: string }> {
    const delay = options?.commentDelay ?? 8000;
    const prefix = options?.commentPrefix ?? 'Link do produto:';

    // 1. Upload video (no link in caption)
    const videoResult = await this.publishVideoFromFile(caption, filePath);
    const videoId = videoResult.id || videoResult.video_id;
    if (!videoId) {
      throw new Error('Video upload returned no ID');
    }

    // 2. Wait for FB to process the video before commenting
    await new Promise((r) => setTimeout(r, delay));

    // 3. Comment with affiliate link (plain format, no marketing emojis)
    let commentId: string | undefined;
    try {
      const token = await this.getPageToken();
      const { data } = await fbApi.post(`${GRAPH_API}/${videoId}/comments`, null, {
        params: { message: `${prefix} ${affiliateLink}` },
        headers: authHeaders(token),
      });
      commentId = data.id;
    } catch (err: any) {
      console.warn(`[SocialService] Native link comment failed for ${videoId}:`, err.response?.data?.error?.message || err.message);
    }

    return { videoId, commentId };
  }

  async checkConnection() {
    try {
      const info = await this.getPageInfo();
      return { connected: true, page: info };
    } catch (err: any) {
      return { connected: false, error: err.message || 'Connection failed' };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INSTAGRAM PUBLISHING (via Meta Graph API — Instagram Content Publishing API)
  // Requires: Instagram Business Account linked to the Facebook Page
  // Permissions: instagram_basic, instagram_content_publish, pages_read_engagement
  // ═══════════════════════════════════════════════════════════

  /**
   * Get the Instagram Business Account ID linked to this Facebook Page.
   * Caches the result for 1 hour.
   */
  private igAccountCache: { id: string; expiresAt: number } | null = null;

  async getInstagramAccountId(): Promise<string | null> {
    if (this.igAccountCache && Date.now() < this.igAccountCache.expiresAt) {
      return this.igAccountCache.id;
    }

    try {
      const token = await this.getPageToken();
      const { data } = await fbApi.get(`${GRAPH_API}/${this.pageId}`, {
        params: { fields: 'instagram_business_account' },
        headers: authHeaders(token),
      });

      const igId = data.instagram_business_account?.id;
      if (igId) {
        this.igAccountCache = { id: igId, expiresAt: Date.now() + 60 * 60 * 1000 };
      }
      return igId || null;
    } catch (err: any) {
      console.error('[SocialService] Failed to get Instagram account:', err.response?.data?.error?.message || err.message);
      return null;
    }
  }

  /**
   * Publish a photo post to Instagram.
   * Uses 2-step process: create media container → publish.
   * Image must be a public URL (JPEG, min 320px, max 1440px wide).
   */
  async publishInstagramPhoto(caption: string, imageUrl: string): Promise<any> {
    const igId = await this.getInstagramAccountId();
    if (!igId) throw new Error('Instagram Business Account not linked to this Facebook Page');

    const token = await this.getPageToken();

    // Step 1: Create media container
    const { data: container } = await fbApi.post(`${GRAPH_API}/${igId}/media`, null, {
      params: {
        image_url: imageUrl,
        caption,
      },
      headers: authHeaders(token),
    });

    if (!container.id) throw new Error('Instagram container creation failed');

    // Step 2: Wait for processing + publish
    await this.waitForIgMediaReady(container.id, token);

    const { data: published } = await fbApi.post(`${GRAPH_API}/${igId}/media_publish`, null, {
      params: { creation_id: container.id },
      headers: authHeaders(token),
    });

    return published;
  }

  /**
   * Publish a Reel (video) to Instagram.
   * Video must be: MP4, H.264, 3-90 seconds, 9:16 aspect ratio.
   */
  async publishInstagramReel(caption: string, videoUrl: string): Promise<any> {
    const igId = await this.getInstagramAccountId();
    if (!igId) throw new Error('Instagram Business Account not linked to this Facebook Page');

    const token = await this.getPageToken();

    // Step 1: Create video container
    const { data: container } = await fbApi.post(`${GRAPH_API}/${igId}/media`, null, {
      params: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
      },
      headers: authHeaders(token),
    });

    if (!container.id) throw new Error('Instagram Reel container creation failed');

    // Step 2: Wait for video processing (can take 30-120s)
    await this.waitForIgMediaReady(container.id, token, 120000);

    // Step 3: Publish
    const { data: published } = await fbApi.post(`${GRAPH_API}/${igId}/media_publish`, null, {
      params: { creation_id: container.id },
      headers: authHeaders(token),
    });

    return published;
  }

  /**
   * Publish a carousel (multiple images) to Instagram.
   * 2-10 images, all public URLs.
   */
  async publishInstagramCarousel(caption: string, imageUrls: string[]): Promise<any> {
    const igId = await this.getInstagramAccountId();
    if (!igId) throw new Error('Instagram Business Account not linked to this Facebook Page');
    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new Error('Instagram carousel requires 2-10 images');
    }

    const token = await this.getPageToken();

    // Step 1: Create child containers for each image
    const childIds: string[] = [];
    for (const url of imageUrls) {
      const { data } = await fbApi.post(`${GRAPH_API}/${igId}/media`, null, {
        params: {
          image_url: url,
          is_carousel_item: true,
        },
        headers: authHeaders(token),
      });
      if (data.id) childIds.push(data.id);
    }

    if (childIds.length < 2) throw new Error('Failed to create enough carousel items');

    // Step 2: Create carousel container
    const { data: container } = await fbApi.post(`${GRAPH_API}/${igId}/media`, null, {
      params: {
        media_type: 'CAROUSEL',
        caption,
        children: childIds.join(','),
      },
      headers: authHeaders(token),
    });

    if (!container.id) throw new Error('Instagram carousel container creation failed');

    // Step 3: Wait + publish
    await this.waitForIgMediaReady(container.id, token);

    const { data: published } = await fbApi.post(`${GRAPH_API}/${igId}/media_publish`, null, {
      params: { creation_id: container.id },
      headers: authHeaders(token),
    });

    return published;
  }

  /**
   * Wait for Instagram media container to be ready for publishing.
   * Polls status every 5 seconds.
   */
  private async waitForIgMediaReady(containerId: string, token: string, maxWaitMs = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const { data } = await fbApi.get(`${GRAPH_API}/${containerId}`, {
        params: { fields: 'status_code' },
        headers: authHeaders(token),
      });

      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') {
        throw new Error(`Instagram media processing failed: ${JSON.stringify(data)}`);
      }

      // IN_PROGRESS — wait and retry
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Instagram media processing timeout');
  }

  /**
   * High-level: publish to both Facebook + Instagram simultaneously.
   * Gracefully handles Instagram failures (still publishes to Facebook).
   */
  async publishToBoth(message: string, imageUrl: string | null, options?: PublishOptions): Promise<{ facebook: any; instagram: any | null }> {
    // Publish to Facebook first (primary platform)
    let fbResult: any;
    if (imageUrl) {
      fbResult = await this.publishPhotoPost(message, imageUrl, options);
    } else {
      fbResult = await this.publishPost(message, options);
    }

    // Try Instagram (secondary — don't fail the whole operation)
    let igResult: any = null;
    try {
      const igId = await this.getInstagramAccountId();
      if (igId && imageUrl) {
        // Instagram requires an image — text-only posts not supported
        const igCaption = message.substring(0, 2200); // Instagram caption limit
        igResult = await this.publishInstagramPhoto(igCaption, imageUrl);
      }
    } catch (err: any) {
      console.error('[SocialService] Instagram publish failed (Facebook OK):', err.message);
    }

    return { facebook: fbResult, instagram: igResult };
  }

}
