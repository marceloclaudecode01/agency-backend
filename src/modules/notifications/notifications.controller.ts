import { Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import { notificationsService } from './notifications.service';

export class NotificationsController {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const notifications = await notificationsService.getByUser(req.user!.id);
      return ApiResponse.success(res, notifications);
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao buscar notificações', 500);
    }
  }

  async markAsRead(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const notif = await notificationsService.markAsRead(id, req.user!.id);
      return ApiResponse.success(res, notif);
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao marcar notificação', 500);
    }
  }

  async markAllAsRead(req: AuthRequest, res: Response) {
    try {
      await notificationsService.markAllAsRead(req.user!.id);
      return ApiResponse.success(res, null, 'Todas marcadas como lidas');
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao marcar notificações', 500);
    }
  }
}
