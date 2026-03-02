import { Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import { getOrionResponse, getAgentInventory, getDashboardData } from './ai-chat.service';

export async function sendMessage(req: AuthRequest, res: Response) {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return ApiResponse.badRequest(res, 'Mensagem é obrigatória');
    }

    const result = await getOrionResponse(message.trim(), history || []);

    return ApiResponse.success(res, {
      response: result.response,
      commandExecuted: result.commandResult || null,
    }, 'Resposta gerada com sucesso');
  } catch (error: any) {
    console.error('[AI Chat] Error:', error.message);
    return ApiResponse.error(res, 'Erro ao gerar resposta do Orion');
  }
}

export async function getInventory(_req: AuthRequest, res: Response) {
  try {
    const inventory = await getAgentInventory();
    return ApiResponse.success(res, { agents: inventory });
  } catch (error: any) {
    console.error('[AI Chat] Inventory error:', error.message);
    return ApiResponse.error(res, 'Erro ao carregar inventário de agentes');
  }
}

export async function getDashboard(_req: AuthRequest, res: Response) {
  try {
    const dashboard = await getDashboardData();
    return ApiResponse.success(res, dashboard);
  } catch (error: any) {
    console.error('[AI Chat] Dashboard error:', error.message);
    return ApiResponse.error(res, 'Erro ao carregar dashboard');
  }
}
