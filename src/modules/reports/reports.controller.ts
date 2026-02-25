import { Request, Response } from 'express';
import { ReportsService } from './reports.service';
import { ApiResponse } from '../../utils/api-response';

const reportsService = new ReportsService();

export class ReportsController {
  async getRevenue(req: Request, res: Response) {
    try {
      const data = await reportsService.getRevenue(req.query as any);
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch revenue report');
    }
  }

  async getCampaignPerformance(req: Request, res: Response) {
    try {
      const data = await reportsService.getCampaignPerformance();
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch campaign performance');
    }
  }

  async getTopClients(req: Request, res: Response) {
    try {
      const data = await reportsService.getTopClients();
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch top clients');
    }
  }
}
