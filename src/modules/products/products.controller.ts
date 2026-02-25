import { Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import { analyzeProductLink } from '../../agents/link-analyzer.agent';
import { createProductPost } from '../../agents/product-post-creator.agent';
import { analyzePageGrowth } from '../../agents/growth-analyst.agent';
import prisma from '../../config/database';

export class ProductsController {

  // Lista todas as campanhas de produto
  async list(req: AuthRequest, res: Response) {
    try {
      const campaigns = await prisma.productCampaign.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return ApiResponse.success(res, campaigns);
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao listar campanhas', 500);
    }
  }

  // Cria campanha: analisa o link + gera copy + agenda post
  async create(req: AuthRequest, res: Response) {
    try {
      const { productUrl, imageUrl, title } = req.body;
      if (!productUrl || !imageUrl) {
        return ApiResponse.error(res, 'productUrl e imageUrl são obrigatórios', 400);
      }

      // 1. Analisa o link do produto
      console.log(`[Products] Analisando link: ${productUrl}`);
      const productInfo = await analyzeProductLink(productUrl);

      // 2. Cria o copy persuasivo
      console.log(`[Products] Criando copy para: ${productInfo.name}`);
      const postResult = await createProductPost(productInfo, productUrl);

      // 3. Descobre o melhor horário via growth analyst
      let bestTime = postResult.suggestedTime;
      try {
        const insights = await analyzePageGrowth();
        bestTime = insights.bestPostingHours?.[0] || postResult.suggestedTime;
      } catch {}

      // 4. Monta o scheduledFor para hoje no melhor horário
      const [hours, minutes] = bestTime.split(':').map(Number);
      const scheduledFor = new Date();
      scheduledFor.setHours(hours, minutes, 0, 0);
      // Se o horário já passou hoje, agenda para amanhã
      if (scheduledFor < new Date()) {
        scheduledFor.setDate(scheduledFor.getDate() + 1);
      }

      const hashtagsStr = postResult.hashtags
        .map((h: string) => `#${h.replace('#', '')}`)
        .join(' ');

      // 5. Cria o ScheduledPost
      const scheduledPost = await prisma.scheduledPost.create({
        data: {
          topic: `Produto: ${productInfo.name.substring(0, 60)}`,
          message: postResult.message,
          hashtags: hashtagsStr,
          imageUrl,
          status: 'APPROVED',
          scheduledFor,
        },
      });

      // 6. Salva a campanha de produto
      const campaign = await prisma.productCampaign.create({
        data: {
          title: title || productInfo.name,
          productUrl,
          imageUrl,
          productName: productInfo.name,
          productPrice: productInfo.price,
          productDesc: productInfo.description,
          sourceDomain: productInfo.sourceDomain,
          generatedCopy: postResult.message,
          hashtags: hashtagsStr,
          scheduledPostId: scheduledPost.id,
          replyTemplate: postResult.replyTemplate,
          status: 'SCHEDULED',
          autoReply: true,
        },
      });

      return ApiResponse.created(res, {
        campaign,
        scheduledPost,
        productInfo,
        scheduledFor,
      }, `Post agendado para ${scheduledFor.toLocaleString('pt-BR')}!`);
    } catch (error: any) {
      console.error('[Products] Erro ao criar campanha:', error.message);
      return ApiResponse.error(res, error.message || 'Erro ao criar campanha', 500);
    }
  }

  // Retorna detalhes de uma campanha
  async getOne(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const campaign = await prisma.productCampaign.findUnique({ where: { id: id as string } });
      if (!campaign) return ApiResponse.error(res, 'Campanha não encontrada', 404);
      return ApiResponse.success(res, campaign);
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao buscar campanha', 500);
    }
  }

  // Atualiza template de resposta ou status
  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { replyTemplate, autoReply, status } = req.body;
      const campaign = await prisma.productCampaign.update({
        where: { id: id as string },
        data: {
          ...(replyTemplate !== undefined && { replyTemplate }),
          ...(autoReply !== undefined && { autoReply }),
          ...(status !== undefined && { status }),
        },
      });
      return ApiResponse.success(res, campaign, 'Campanha atualizada');
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao atualizar campanha', 500);
    }
  }

  // Deleta campanha
  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await prisma.productCampaign.delete({ where: { id: id as string } });
      return ApiResponse.success(res, null, 'Campanha removida');
    } catch (error: any) {
      return ApiResponse.error(res, 'Erro ao deletar campanha', 500);
    }
  }

  // Apenas analisa o link (pré-visualização antes de criar)
  async analyzeLink(req: AuthRequest, res: Response) {
    try {
      const { url } = req.body;
      if (!url) return ApiResponse.error(res, 'url é obrigatória', 400);
      const info = await analyzeProductLink(url);
      return ApiResponse.success(res, info, 'Link analisado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message || 'Erro ao analisar link', 500);
    }
  }
}
