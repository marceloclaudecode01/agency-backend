import { Response } from 'express';
import { AuthRequest } from '../../types';
import { UsersService } from './users.service';
import { ApiResponse } from '../../utils/api-response';

const usersService = new UsersService();

export class UsersController {
  async findAll(req: AuthRequest, res: Response) {
    try {
      const users = await usersService.findAll(req.query as any);
      return ApiResponse.success(res, users);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch users');
    }
  }

  async findById(req: AuthRequest, res: Response) {
    try {
      const user = await usersService.findById(req.params.id as string);
      return ApiResponse.success(res, user);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch user');
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      const user = await usersService.create(req.body);
      return ApiResponse.created(res, user, 'User created successfully');
    } catch (error: any) {
      if (error.statusCode === 409) return ApiResponse.error(res, error.message, 409);
      return ApiResponse.error(res, 'Failed to create user');
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const user = await usersService.update(req.params.id as string, req.body);
      return ApiResponse.success(res, user, 'User updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      if (error.statusCode === 409) return ApiResponse.error(res, error.message, 409);
      return ApiResponse.error(res, 'Failed to update user');
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      await usersService.delete(req.params.id as string, req.user!.id, req.user!.role);
      return ApiResponse.success(res, null, 'User deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 400) return ApiResponse.error(res, error.message, 400);
      if (error.statusCode === 403) return ApiResponse.error(res, error.message, 403);
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete user');
    }
  }
}
