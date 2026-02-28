import { Request, Response } from 'express';
import { SocialService } from './social.service';
import { ApiResponse } from '../../utils/api-response';
import { AuthRequest } from '../../types';

const socialService = new SocialService();

export class SocialController {
  async checkConnection(req: AuthRequest, res: Response) {
    try {
      const result = await socialService.checkConnection();
      return ApiResponse.success(res, result);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to check connection', error.statusCode || 500);
    }
  }

  async getPageInfo(req: AuthRequest, res: Response) {
    try {
      const data = await socialService.getPageInfo();
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to get page info', error.statusCode || 500);
    }
  }

  async getInsights(req: Request, res: Response) {
    try {
      const period = (req.query.period as 'day' | 'week' | 'month') || 'month';
      const data = await socialService.getPageInsights(period);
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to get insights', error.statusCode || 500);
    }
  }

  async getPosts(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const data = await socialService.getPosts(limit);
      return ApiResponse.success(res, data);
    } catch (error: any) {
      const status = error.statusCode || 500;
      return ApiResponse.error(res, error.message || 'Failed to get posts', status, error.fbResponse || null);
    }
  }

  async getScheduledPosts(req: AuthRequest, res: Response) {
    try {
      const data = await socialService.getScheduledPosts();
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to get scheduled posts', error.statusCode || 500);
    }
  }

  async publishPost(req: AuthRequest, res: Response) {
    try {
      const { message, imageUrl, mediaUrl, mediaType, linkUrl, scheduledTime } = req.body;
      const finalMediaUrl = mediaUrl || imageUrl || null;

      const data = finalMediaUrl
        ? await socialService.publishMediaPost(message, finalMediaUrl, { mediaType, linkUrl, scheduledTime })
        : await socialService.publishPost(message, { linkUrl, scheduledTime });

      return ApiResponse.created(res, data, scheduledTime ? 'Post scheduled successfully' : 'Post published successfully');
    } catch (error: any) {
      return ApiResponse.error(res, error.response?.data?.error?.message || error.message || 'Failed to publish post', error.statusCode || 500);
    }
  }

  async deletePost(req: AuthRequest, res: Response) {
    try {
      const postId = req.params['postId'] as string;
      const data = await socialService.deletePost(postId);
      return ApiResponse.success(res, data, 'Post deleted successfully');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to delete post', error.statusCode || 500);
    }
  }

  async getPostComments(req: Request, res: Response) {
    try {
      const postId = req.params['postId'] as string;
      const data = await socialService.getPostComments(postId);
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Failed to get comments', error.statusCode || 500);
    }
  }
}
