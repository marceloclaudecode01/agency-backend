import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { ApiResponse } from '../../utils/api-response';

const analyticsService = new AnalyticsService();

export class AnalyticsController {
  async getOverview(req: Request, res: Response) {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const overview = await analyticsService.getOverview(days);
      return ApiResponse.success(res, overview, 'Analytics overview');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  async getPostsRanking(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const posts = await analyticsService.getPostsRanking(limit);
      return ApiResponse.success(res, posts, 'Posts ranking');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  async getBestTimes(_req: Request, res: Response) {
    try {
      const times = await analyticsService.getBestTimes();
      return ApiResponse.success(res, times, 'Best posting times');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  async getAgentActivity(req: Request, res: Response) {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const activity = await analyticsService.getAgentActivity(hours);
      return ApiResponse.success(res, activity, 'Agent activity');
    } catch (err: any) {
      return ApiResponse.error(res, err.message, 500);
    }
  }
}
