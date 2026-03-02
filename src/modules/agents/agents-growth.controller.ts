import { Response } from 'express';
import { AuthRequest } from '../../types';
import { ApiResponse } from '../../utils/api-response';
import prisma from '../../config/database';
import { scanForLeads, getLeadPipeline, updateLeadStage, addLeadInteraction } from '../../agents/lead-capture.agent';
import { analyzeFunnelPerformance, suggestMonetization, getFunnelStats } from '../../agents/monetization-engine.agent';
import { generateStrategicPlan, getCurrentPlan } from '../../agents/strategic-command.agent';
import { gatherMarketIntel, getMarketInsights } from '../../agents/market-intelligence.agent';
import { learnFromAudience, getAudienceProfile } from '../../agents/niche-learning.agent';
import { generateAdCreative, getCreativesForCampaign } from '../../agents/ad-creative.agent';
import { syncAdCampaigns, getAdDashboard } from '../../agents/paid-traffic.agent';
import { checkCompliance, getComplianceStats } from '../../agents/policy-compliance.agent';
import { getVariationStats } from '../../agents/pattern-variation.agent';

export class AgentsGrowthController {
  // ═══════════════════════════════════════════════════════════
  // EPIC 3: LEADS / CRM
  // ═══════════════════════════════════════════════════════════

  async getLeads(req: AuthRequest, res: Response) {
    try {
      const { stage } = req.query as { stage?: string };
      const where: any = {};
      if (stage) where.stage = stage;
      const leads = await prisma.lead.findMany({
        where,
        orderBy: { score: 'desc' },
        include: { interactions: { take: 3, orderBy: { createdAt: 'desc' } } },
      });
      return ApiResponse.success(res, leads);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getLeadPipelineEndpoint(_req: AuthRequest, res: Response) {
    try {
      const pipeline = await getLeadPipeline();
      return ApiResponse.success(res, pipeline);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createLead(req: AuthRequest, res: Response) {
    try {
      const lead = await prisma.lead.create({ data: { ...req.body, source: req.body.source || 'manual' } });
      return ApiResponse.created(res, lead, 'Lead criado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateLead(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const lead = await prisma.lead.update({ where: { id }, data: req.body });
      return ApiResponse.success(res, lead, 'Lead atualizado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async moveLeadStage(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const { stage } = req.body;
      const lead = await updateLeadStage(id, stage);
      return ApiResponse.success(res, lead, `Lead movido para ${stage}`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async addInteraction(req: AuthRequest, res: Response) {
    try {
      const leadId = req.params.id as string;
      const { type, content, direction } = req.body;
      const interaction = await addLeadInteraction(leadId, type, content, direction);
      return ApiResponse.created(res, interaction, 'Interação registrada');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async scanLeadsNow(_req: AuthRequest, res: Response) {
    try {
      const result = await scanForLeads();
      return ApiResponse.success(res, result, `${result.created} leads capturados`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EPIC 4: MONETIZATION
  // ═══════════════════════════════════════════════════════════

  async getFunnels(_req: AuthRequest, res: Response) {
    try {
      const stats = await getFunnelStats();
      return ApiResponse.success(res, stats);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createFunnel(req: AuthRequest, res: Response) {
    try {
      const funnel = await prisma.funnel.create({ data: req.body });
      return ApiResponse.created(res, funnel, 'Funil criado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateFunnel(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const funnel = await prisma.funnel.update({ where: { id }, data: req.body });
      return ApiResponse.success(res, funnel, 'Funil atualizado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getOffers(_req: AuthRequest, res: Response) {
    try {
      const offers = await prisma.offer.findMany({ include: { funnel: true }, orderBy: { createdAt: 'desc' } });
      return ApiResponse.success(res, offers);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createOffer(req: AuthRequest, res: Response) {
    try {
      const offer = await prisma.offer.create({ data: req.body });
      return ApiResponse.created(res, offer, 'Oferta criada');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateOffer(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const offer = await prisma.offer.update({ where: { id }, data: req.body });
      return ApiResponse.success(res, offer, 'Oferta atualizada');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async analyzeFunnels(_req: AuthRequest, res: Response) {
    try {
      const result = await analyzeFunnelPerformance();
      return ApiResponse.success(res, result, 'Análise de funis concluída');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getMonetizationSuggestions(_req: AuthRequest, res: Response) {
    try {
      const suggestions = await suggestMonetization();
      return ApiResponse.success(res, suggestions);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EPIC 5: STRATEGIC COMMAND
  // ═══════════════════════════════════════════════════════════

  async getStrategicPlan(_req: AuthRequest, res: Response) {
    try {
      const plan = await getCurrentPlan();
      return ApiResponse.success(res, plan);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async generatePlanNow(_req: AuthRequest, res: Response) {
    try {
      const plan = await generateStrategicPlan();
      return ApiResponse.success(res, plan, 'Plano estratégico gerado');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EPIC 6: MARKET INTELLIGENCE
  // ═══════════════════════════════════════════════════════════

  async getMarketIntel(req: AuthRequest, res: Response) {
    try {
      const { type } = req.query as { type?: string };
      const insights = await getMarketInsights(type);
      return ApiResponse.success(res, insights);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async gatherIntelNow(_req: AuthRequest, res: Response) {
    try {
      const result = await gatherMarketIntel();
      return ApiResponse.success(res, result, `${result.created} insights coletados`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EPIC 7: NICHE LEARNING
  // ═══════════════════════════════════════════════════════════

  async getAudienceInsights(_req: AuthRequest, res: Response) {
    try {
      const profile = await getAudienceProfile();
      return ApiResponse.success(res, profile);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async learnNow(_req: AuthRequest, res: Response) {
    try {
      const result = await learnFromAudience();
      return ApiResponse.success(res, result, 'Aprendizado concluído');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EPIC 8: PAID TRAFFIC
  // ═══════════════════════════════════════════════════════════

  async getAdsDashboard(_req: AuthRequest, res: Response) {
    try {
      const dashboard = await getAdDashboard();
      return ApiResponse.success(res, dashboard);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async createAdCampaign(req: AuthRequest, res: Response) {
    try {
      const campaign = await prisma.adCampaign.create({ data: req.body });
      return ApiResponse.created(res, campaign, 'Campanha criada');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async updateAdCampaign(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const campaign = await prisma.adCampaign.update({ where: { id }, data: req.body });
      return ApiResponse.success(res, campaign, 'Campanha atualizada');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async generateCreatives(req: AuthRequest, res: Response) {
    try {
      const { campaignId, count } = req.body;
      if (!campaignId) return ApiResponse.error(res, 'campaignId é obrigatório', 400);
      const creatives = await generateAdCreative(campaignId, count);
      return ApiResponse.success(res, creatives, `${creatives.length} criativos gerados`);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getCampaignCreatives(req: AuthRequest, res: Response) {
    try {
      const campaignId = req.params.campaignId as string;
      const creatives = await getCreativesForCampaign(campaignId);
      return ApiResponse.success(res, creatives);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async syncAdsNow(_req: AuthRequest, res: Response) {
    try {
      const result = await syncAdCampaigns();
      return ApiResponse.success(res, result, 'Sync concluído');
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EPIC 9: COMPLIANCE + VARIATION STATS
  // ═══════════════════════════════════════════════════════════

  async getComplianceStatsEndpoint(_req: AuthRequest, res: Response) {
    try {
      const stats = await getComplianceStats();
      return ApiResponse.success(res, stats);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async checkComplianceEndpoint(req: AuthRequest, res: Response) {
    try {
      const { message, platform } = req.body;
      if (!message) return ApiResponse.error(res, 'message é obrigatório', 400);
      const result = await checkCompliance(message, platform);
      return ApiResponse.success(res, result);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }

  async getVariationStatsEndpoint(_req: AuthRequest, res: Response) {
    try {
      const stats = await getVariationStats();
      return ApiResponse.success(res, stats);
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500);
    }
  }
}
