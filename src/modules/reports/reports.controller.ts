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

  async exportRevenueCsv(req: Request, res: Response) {
    try {
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const csv = await reportsService.exportRevenueCsv({ startDate, endDate });

      const periodLabel =
        startDate && endDate
          ? `${startDate}_${endDate}`
          : new Date().toISOString().slice(0, 7);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="receita-${periodLabel}.csv"`
      );
      return res.status(200).send(csv);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to export revenue CSV');
    }
  }

  async exportClientsCsv(req: Request, res: Response) {
    try {
      const csv = await reportsService.exportClientsCsv();

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="clientes-ranking.csv"'
      );
      return res.status(200).send(csv);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to export clients CSV');
    }
  }
}
