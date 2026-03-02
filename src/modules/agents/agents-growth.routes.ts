import { Router } from 'express';
import { AgentsGrowthController } from './agents-growth.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth';

const router = Router();
const controller = new AgentsGrowthController();

router.use(authMiddleware);

// Epic 3: Leads / CRM
router.get('/leads', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getLeads(req as any, res));
router.get('/leads/pipeline', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getLeadPipelineEndpoint(req as any, res));
router.post('/leads', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.createLead(req as any, res));
router.patch('/leads/:id', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.updateLead(req as any, res));
router.patch('/leads/:id/stage', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.moveLeadStage(req as any, res));
router.post('/leads/:id/interactions', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.addInteraction(req as any, res));
router.post('/leads/scan', requireRole('ADMIN'), (req, res) => controller.scanLeadsNow(req as any, res));

// Epic 4: Monetization
router.get('/funnels', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getFunnels(req as any, res));
router.post('/funnels', requireRole('ADMIN'), (req, res) => controller.createFunnel(req as any, res));
router.patch('/funnels/:id', requireRole('ADMIN'), (req, res) => controller.updateFunnel(req as any, res));
router.get('/offers', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getOffers(req as any, res));
router.post('/offers', requireRole('ADMIN'), (req, res) => controller.createOffer(req as any, res));
router.patch('/offers/:id', requireRole('ADMIN'), (req, res) => controller.updateOffer(req as any, res));
router.post('/funnels/analyze', requireRole('ADMIN'), (req, res) => controller.analyzeFunnels(req as any, res));
router.get('/monetization/suggestions', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getMonetizationSuggestions(req as any, res));

// Epic 5: Strategic Command
router.get('/strategic-plan', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getStrategicPlan(req as any, res));
router.post('/strategic-plan/generate', requireRole('ADMIN'), (req, res) => controller.generatePlanNow(req as any, res));

// Epic 6: Market Intelligence
router.get('/market-intel', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getMarketIntel(req as any, res));
router.post('/market-intel/gather', requireRole('ADMIN'), (req, res) => controller.gatherIntelNow(req as any, res));

// Epic 7: Niche Learning
router.get('/audience', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getAudienceInsights(req as any, res));
router.post('/audience/learn', requireRole('ADMIN'), (req, res) => controller.learnNow(req as any, res));

// Epic 8: Paid Traffic
router.get('/ads', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getAdsDashboard(req as any, res));
router.post('/ads/campaigns', requireRole('ADMIN'), (req, res) => controller.createAdCampaign(req as any, res));
router.patch('/ads/campaigns/:id', requireRole('ADMIN'), (req, res) => controller.updateAdCampaign(req as any, res));
router.post('/ads/creatives', requireRole('ADMIN'), (req, res) => controller.generateCreatives(req as any, res));
router.get('/ads/campaigns/:campaignId/creatives', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getCampaignCreatives(req as any, res));
router.post('/ads/sync', requireRole('ADMIN'), (req, res) => controller.syncAdsNow(req as any, res));

// Epic 9: Compliance + Variation
router.get('/compliance/stats', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getComplianceStatsEndpoint(req as any, res));
router.post('/compliance/check', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.checkComplianceEndpoint(req as any, res));
router.get('/variation/stats', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getVariationStatsEndpoint(req as any, res));

export default router;
