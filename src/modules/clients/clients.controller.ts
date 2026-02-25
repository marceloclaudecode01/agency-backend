import { Request, Response } from 'express';
import { ClientsService } from './clients.service';
import { ApiResponse } from '../../utils/api-response';

const clientsService = new ClientsService();

export class ClientsController {
  async findAll(req: Request, res: Response) {
    try {
      const clients = await clientsService.findAll(req.query as any);
      return ApiResponse.success(res, clients);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch clients');
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const client = await clientsService.findById(req.params.id as string);
      return ApiResponse.success(res, client);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch client');
    }
  }

  async create(req: Request, res: Response) {
    try {
      const client = await clientsService.create(req.body);
      return ApiResponse.created(res, client, 'Client created successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to create client');
    }
  }

  async update(req: Request, res: Response) {
    try {
      const client = await clientsService.update(req.params.id as string, req.body);
      return ApiResponse.success(res, client, 'Client updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update client');
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await clientsService.delete(req.params.id as string);
      return ApiResponse.success(res, null, 'Client deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete client');
    }
  }
}
