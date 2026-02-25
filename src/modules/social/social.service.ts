import axios from 'axios';

const GRAPH_API = 'https://graph.facebook.com/v19.0';

function getToken() {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
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
  // Busca informações básicas da página
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

  // Busca métricas de alcance e engajamento
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

    // Formata os dados para o frontend
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

  // Lista posts publicados na página
  async getPosts(limit = 10) {
    const token = getToken();
    const pageId = getPageId();
    const { data } = await axios.get(`${GRAPH_API}/${pageId}/posts`, {
      params: {
        fields: 'id,message,story,created_time,full_picture,permalink_url,insights.metric(post_impressions,post_engaged_users,post_reactions_by_type_total)',
        limit,
        access_token: token,
      },
    });
    return data.data || [];
  }

  // Publica um post de texto na página
  async publishPost(message: string, scheduledTime?: string) {
    const token = getToken();
    const pageId = getPageId();

    const params: any = { message, access_token: token };

    if (scheduledTime) {
      params.scheduled_publish_time = Math.floor(new Date(scheduledTime).getTime() / 1000);
      params.published = false;
    }

    const { data } = await axios.post(`${GRAPH_API}/${pageId}/feed`, null, { params });
    return data;
  }

  // Publica um post com imagem (URL pública da imagem)
  async publishPhotoPost(message: string, imageUrl: string, scheduledTime?: string) {
    const token = getToken();
    const pageId = getPageId();

    const params: any = {
      caption: message,
      url: imageUrl,
      access_token: token,
    };

    if (scheduledTime) {
      params.scheduled_publish_time = Math.floor(new Date(scheduledTime).getTime() / 1000);
      params.published = false;
    }

    const { data } = await axios.post(`${GRAPH_API}/${pageId}/photos`, null, { params });
    return data;
  }

  // Busca posts agendados (não publicados)
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

  // Deleta um post
  async deletePost(postId: string) {
    const token = getToken();
    const { data } = await axios.delete(`${GRAPH_API}/${postId}`, {
      params: { access_token: token },
    });
    return data;
  }

  // Busca comentários de um post
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

  // Responde a um comentário
  async replyToComment(commentId: string, message: string): Promise<void> {
    const token = getToken();
    await axios.post(`${GRAPH_API}/${commentId}/comments`, null, {
      params: { message, access_token: token },
    });
  }

  // Verifica se o token e o page ID estão configurados e válidos
  async checkConnection() {
    try {
      const info = await this.getPageInfo();
      return { connected: true, page: info };
    } catch (err: any) {
      return { connected: false, error: err.message || 'Connection failed' };
    }
  }
}
