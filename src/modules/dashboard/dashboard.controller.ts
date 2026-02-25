import { Response } from 'express';
import { AuthRequest } from '../../types';
import { DashboardService } from './dashboard.service';
import { ApiResponse } from '../../utils/api-response';

const dashboardService = new DashboardService();

export class DashboardController {
  async getSummary(req: AuthRequest, res: Response) {
    try {
      const data = await dashboardService.getSummary(req.user!.id);
      return ApiResponse.success(res, data);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to get dashboard summary');
    }
  }
}
