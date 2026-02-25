import { Request, Response } from 'express';
import { CampaignsService } from './campaigns.service';
import { ApiResponse } from '../../utils/api-response';

const campaignsService = new CampaignsService();

export class CampaignsController {
  async findAll(req: Request, res: Response) {
    try {
      const campaigns = await campaignsService.findAll(req.query as any);
      return ApiResponse.success(res, campaigns);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch campaigns');
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const campaign = await campaignsService.findById(req.params.id as string);
      return ApiResponse.success(res, campaign);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch campaign');
    }
  }

  async create(req: Request, res: Response) {
    try {
      const campaign = await campaignsService.create(req.body);
      return ApiResponse.created(res, campaign, 'Campaign created successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to create campaign');
    }
  }

  async update(req: Request, res: Response) {
    try {
      const campaign = await campaignsService.update(req.params.id as string, req.body);
      return ApiResponse.success(res, campaign, 'Campaign updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update campaign');
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await campaignsService.delete(req.params.id as string);
      return ApiResponse.success(res, null, 'Campaign deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete campaign');
    }
  }
}
