import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ApiResponse } from '../../utils/api-response';
import { AuthRequest } from '../../types';

const authService = new AuthService();

// Access token cookie — name kept as 'token' so Next.js middleware.ts (Story 1.3 scope) keeps working
const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/',
};

// Refresh token cookie — path covers both /api/auth/refresh and /api/auth/logout
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/api/auth',
};

export class AuthController {
  async register(req: Request, res: Response) {
    try {
      const result = await authService.register(req.body);
      res.cookie('token', result.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);
      return ApiResponse.created(res, { user: result.user }, 'User registered successfully');
    } catch (error: unknown) {
      if (error instanceof Object && 'statusCode' in error && (error as any).statusCode === 409) {
        return ApiResponse.error(res, error instanceof Error ? error.message : (error as any).message, 409);
      }
      return ApiResponse.error(res, 'Failed to register user');
    }
  }

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.cookie('token', result.accessToken, ACCESS_COOKIE_OPTIONS);
      res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);
      return ApiResponse.success(res, { user: result.user }, 'Login successful');
    } catch (error: unknown) {
      if (error instanceof Object && 'statusCode' in error && (error as any).statusCode === 401) {
        return ApiResponse.unauthorized(res, error instanceof Error ? error.message : (error as any).message);
      }
      return ApiResponse.error(res, 'Failed to login');
    }
  }

  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      authService.invalidateRefreshToken(refreshToken);
    }
    res.clearCookie('token', { ...ACCESS_COOKIE_OPTIONS });
    res.clearCookie('refresh_token', { ...REFRESH_COOKIE_OPTIONS });
    return ApiResponse.success(res, null, 'Logged out successfully');
  }

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return ApiResponse.unauthorized(res, 'Refresh token not provided');
    }

    try {
      const newAccessToken = await authService.refreshAccessToken(refreshToken);
      res.cookie('token', newAccessToken, ACCESS_COOKIE_OPTIONS);
      return ApiResponse.success(res, null, 'Token refreshed successfully');
    } catch (error: unknown) {
      if (error instanceof Object && 'statusCode' in error && (error as any).statusCode === 401) {
        return ApiResponse.unauthorized(res, error instanceof Error ? error.message : (error as any).message);
      }
      return ApiResponse.error(res, 'Failed to refresh token');
    }
  }

  async me(req: AuthRequest, res: Response) {
    try {
      const user = await authService.getProfile(req.user!.id);
      return ApiResponse.success(res, user);
    } catch (error: unknown) {
      if (error instanceof Object && 'statusCode' in error && (error as any).statusCode === 404) {
        return ApiResponse.notFound(res, error instanceof Error ? error.message : (error as any).message);
      }
      return ApiResponse.error(res, 'Failed to get profile');
    }
  }

  async updateProfile(req: AuthRequest, res: Response) {
    try {
      const user = await authService.updateProfile(req.user!.id, req.body);
      return ApiResponse.success(res, user, 'Profile updated successfully');
    } catch (error: unknown) {
      if (error instanceof Object && 'statusCode' in error) {
        const e = error as { statusCode: number; message: string };
        return ApiResponse.error(res, e.message, e.statusCode);
      }
      return ApiResponse.error(res, 'Failed to update profile');
    }
  }
}
