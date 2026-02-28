import axios from 'axios';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

type PublishOptions = {
  scheduledTime?: string;
  linkUrl?: string | null;
};

type PublishMediaOptions = PublishOptions & {
  mediaType?: 'image' | 'video' | null;
};

function getToken() {
  const token = (process.env.FACEBOOK_ACCESS_TOKEN || '').trim();
  if (!token || token === 'cole_seu_novo_token_aqui') {
    throw { statusCode: 503, message: 'Facebook token not configured' };
  }
  return token;
}

function getPageId() {
  const id = process.env.FACEBOOK_PAGE_ID;
  if (!id || id === 'cole_o_page_id_aqui') {
    throw { statusCode: 503, message: 'Facebook page ID not configured' };
  }
  return id;
}

export class SocialService {
  async getPageInfo() {
    const token = getToken();
    const pageId = getPageId();
    const { data } = await axios.get(`${GRAPH_API}/${pageId}`, {
      params: {
        fields: 'id,name,fan_count,followers_count,about,category,picture,cover,website',
        access_token: token,
      },
    });
    return data;
  }

  async getPageInsights(period: 'day' | 'week' | 'month' = 'month') {
    const token = getToken();
    const pageId = getPageId();

    const metrics = [
      'page_impressions',
      'page_impressions_unique',
      'page_engaged_users',
      'page_post_engagements',
      'page_fans',
      'page_fan_adds',
      'page_views_total',
    ].join(',');

    const { data } = await axios.get(`${GRAPH_API}/${pageId}/insights`, {
      params: {
        metric: metrics,
        period,
        access_token: token,
      },
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
    const token = getToken();
    const pageId = getPageId();
    try {
      const { data } = await axios.get(`${GRAPH_API}/${pageId}/posts`, {
        params: {
          fields: 'id,message,story,created_time,full_picture,permalink_url',
          limit,
          access_token: token,
        },
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
    const token = getToken();
    const pageId = getPageId();

    const finalMessage = this.buildMessageWithLink(message, options?.linkUrl);
    const params = this.withSchedule({ message: finalMessage, access_token: token }, options?.scheduledTime);

    const { data } = await axios.post(`${GRAPH_API}/${pageId}/feed`, null, { params });
    return data;
  }

  async publishPhotoPost(message: string, imageUrl: string, options?: PublishOptions) {
    const token = getToken();
    const pageId = getPageId();

    const finalCaption = this.buildMessageWithLink(message, options?.linkUrl);
    const params = this.withSchedule(
      {
        caption: finalCaption,
        url: imageUrl,
        access_token: token,
      },
      options?.scheduledTime,
    );

    const { data } = await axios.post(`${GRAPH_API}/${pageId}/photos`, null, { params });
    return data;
  }

  async publishVideoPost(message: string, videoUrl: string, options?: PublishOptions) {
    const token = getToken();
    const pageId = getPageId();

    const finalDescription = this.buildMessageWithLink(message, options?.linkUrl);
    const params = this.withSchedule(
      {
        description: finalDescription,
        file_url: videoUrl,
        access_token: token,
      },
      options?.scheduledTime,
    );

    const { data } = await axios.post(`${GRAPH_API}/${pageId}/videos`, null, { params });
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
    const token = getToken();
    const pageId = getPageId();
    const { data } = await axios.get(`${GRAPH_API}/${pageId}/scheduled_posts`, {
      params: {
        fields: 'id,message,scheduled_publish_time,full_picture',
        access_token: token,
      },
    });
    return data.data || [];
  }

  async deletePost(postId: string) {
    const token = getToken();
    const { data } = await axios.delete(`${GRAPH_API}/${postId}`, {
      params: { access_token: token },
    });
    return data;
  }

  async getPostComments(postId: string) {
    const token = getToken();
    const { data } = await axios.get(`${GRAPH_API}/${postId}/comments`, {
      params: {
        fields: 'id,message,from,created_time,like_count',
        access_token: token,
      },
    });
    return data.data || [];
  }

  async replyToComment(commentId: string, message: string): Promise<void> {
    const token = getToken();
    await axios.post(`${GRAPH_API}/${commentId}/comments`, null, {
      params: { message, access_token: token },
    });
  }

  async checkConnection() {
    try {
      const info = await this.getPageInfo();
      return { connected: true, page: info };
    } catch (err: any) {
      return { connected: false, error: err.message || 'Connection failed' };
    }
  }
}
