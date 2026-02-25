import { Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import { ChatService } from './chat.service';

const chatService = new ChatService();

export class ChatController {
  async getConversation(req: AuthRequest, res: Response) {
    try {
      const messages = await chatService.getConversation(req.user!.id, req.params.userId as string);
      await chatService.markAsRead(req.user!.id, req.params.userId as string);
      return ApiResponse.success(res, messages);
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao buscar conversa', 500);
    }
  }

  async getUnreadCounts(req: AuthRequest, res: Response) {
    try {
      const counts = await chatService.getUnreadCounts(req.user!.id);
      return ApiResponse.success(res, counts);
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao buscar não lidas', 500);
    }
  }

  async markAsRead(req: AuthRequest, res: Response) {
    try {
      await chatService.markAsRead(req.user!.id, req.params.senderId as string);
      return ApiResponse.success(res, null, 'Marcado como lido');
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao marcar como lido', 500);
    }
  }
}
