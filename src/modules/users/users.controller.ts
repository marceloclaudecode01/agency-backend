import { Request, Response } from 'express';
import { UsersService } from './users.service';
import { ApiResponse } from '../../utils/api-response';

const usersService = new UsersService();

export class UsersController {
  async findAll(req: Request, res: Response) {
    try {
      const users = await usersService.findAll(req.query as any);
      return ApiResponse.success(res, users);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch users');
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const user = await usersService.findById(req.params.id as string);
      return ApiResponse.success(res, user);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch user');
    }
  }

  async create(req: Request, res: Response) {
    try {
      const user = await usersService.create(req.body);
      return ApiResponse.created(res, user, 'User created successfully');
    } catch (error: any) {
      if (error.statusCode === 409) return ApiResponse.error(res, error.message, 409);
      return ApiResponse.error(res, 'Failed to create user');
    }
  }

  async update(req: Request, res: Response) {
    try {
      const user = await usersService.update(req.params.id as string, req.body);
      return ApiResponse.success(res, user, 'User updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      if (error.statusCode === 409) return ApiResponse.error(res, error.message, 409);
      return ApiResponse.error(res, 'Failed to update user');
    }
  }

  async delete(req: Request, res: Response) {
    try {
      await usersService.delete(req.params.id as string);
      return ApiResponse.success(res, null, 'User deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete user');
    }
  }
}
