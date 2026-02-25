import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ApiResponse } from '../../utils/api-response';
import { AuthRequest } from '../../types';

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response) {
    try {
      const user = await authService.register(req.body);
      return ApiResponse.created(res, user, 'User registered successfully');
    } catch (error: any) {
      if (error.statusCode === 409) {
        return ApiResponse.error(res, error.message, 409);
      }
      return ApiResponse.error(res, 'Failed to register user');
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      return ApiResponse.success(res, result, 'Login successful');
    } catch (error: any) {
      if (error.statusCode === 401) {
        return ApiResponse.unauthorized(res, error.message);
      }
      return ApiResponse.error(res, 'Failed to login');
    }
  }

  async me(req: AuthRequest, res: Response) {
    try {
      const user = await authService.getProfile(req.user!.id);
      return ApiResponse.success(res, user);
    } catch (error: any) {
      if (error.statusCode === 404) {
        return ApiResponse.notFound(res, error.message);
      }
      return ApiResponse.error(res, 'Failed to get profile');
    }
  }

  async updateProfile(req: AuthRequest, res: Response) {
    try {
      const user = await authService.updateProfile(req.user!.id, req.body);
      return ApiResponse.success(res, user, 'Profile updated successfully');
    } catch (error: any) {
      if (error.statusCode) {
        return ApiResponse.error(res, error.message, error.statusCode);
      }
      return ApiResponse.error(res, 'Failed to update profile');
    }
  }
}
