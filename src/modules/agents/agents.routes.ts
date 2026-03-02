import { Router } from 'express';
import { AgentsController } from './agents.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth';
import { upload } from '../../middlewares/upload';

const router = Router();
const controller = new AgentsController();

router.use(authMiddleware);

// Geração de conteúdo com IA
router.post('/generate-post', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.generatePost(req as any, res));
router.post('/generate-weekly', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.generateWeeklyPlan(req as any, res));

// Posts agendados
router.get('/scheduled', (req, res) => controller.getScheduledPosts(req as any, res));
router.post('/scheduled', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.createScheduledPost(req as any, res));
router.patch('/scheduled/:id/approve', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.approvePost(req as any, res));
router.patch('/scheduled/:id/reject', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.rejectPost(req as any, res));
router.delete('/scheduled/:id', requireRole('ADMIN'), (req, res) => controller.deleteScheduledPost(req as any, res));

// Métricas
router.get('/metrics', (req, res) => controller.getMetricsReports(req as any, res));
router.post('/metrics/run', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.runMetricsNow(req as any, res));

// Motor autônomo
router.get('/engine/status', (req, res) => controller.getEngineStatus(req as any, res));
router.post('/engine/run', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.runEngineNow(req as any, res));

// Trending topics
router.get('/trending', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getTrendingTopics(req as any, res));

// TikTok Shop
router.get('/products/tiktok', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getTikTokProducts(req as any, res));
router.post('/products/run', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.runProductOrchestrator(req as any, res));

// Criar post a partir de link de produto
router.post('/post-from-link', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.createPostFromLink(req as any, res));

// Upload de mídia (imagem ou vídeo)
router.post('/upload-media', requireRole('ADMIN', 'MANAGER'), upload.single('file'), (req, res) => controller.uploadMedia(req as any, res));

// Growth insights
router.get('/growth', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getGrowthInsights(req as any, res));

// Token monitor
router.get('/token/status', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getTokenStatus(req as any, res));

// Logs de comunicação entre agentes
router.get('/logs', (req, res) => controller.getAgentLogs(req as any, res));

// Phase 6: Control panel routes
router.get('/status', (req, res) => controller.getAgentsStatus(req as any, res));
router.post('/safe-mode', requireRole('ADMIN'), (req, res) => controller.setSafeMode(req as any, res));
router.post('/pause/:agentName', requireRole('ADMIN'), (req, res) => controller.toggleAgent(req as any, res));
router.post('/override/:id', requireRole('ADMIN'), (req, res) => controller.overridePost(req as any, res));
router.post('/strategy', requireRole('ADMIN'), (req, res) => controller.overrideStrategy(req as any, res));
router.post('/sentinel/run', requireRole('ADMIN'), (req, res) => controller.runSentinelNow(req as any, res));

// Phase 4: Brand config
router.get('/brand', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getBrandConfig(req as any, res));
router.put('/brand', requireRole('ADMIN'), (req, res) => controller.updateBrandConfigEndpoint(req as any, res));

// Phase 9: Performance insights
router.get('/performance', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getPerformanceInsightsEndpoint(req as any, res));

// Phase 8: Content campaigns
router.get('/campaigns', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getCampaigns(req as any, res));
router.post('/campaigns', requireRole('ADMIN'), (req, res) => controller.createCampaign(req as any, res));
router.patch('/campaigns/:id', requireRole('ADMIN'), (req, res) => controller.updateCampaign(req as any, res));

// Epic 2: Content Replicator & Multi-format
router.post('/replicate', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.replicatePost(req as any, res));
router.get('/replicas/stats', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getReplicaStatsEndpoint(req as any, res));
router.get('/replicas/:postId', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getPostReplicas(req as any, res));
router.post('/optimize-platform', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.optimizePost(req as any, res));
router.post('/carousel', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.generateCarouselEndpoint(req as any, res));
router.get('/carousel/styles', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getCarouselStylesEndpoint(req as any, res));

// Epic 1: A/B Testing
router.get('/ab-tests', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getABTestStatsEndpoint(req as any, res));
router.post('/ab-tests/measure', requireRole('ADMIN'), (req, res) => controller.runABMeasurement(req as any, res));

// Epic 1: Aggressive Growth Mode
router.get('/aggressive-mode', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getAggressiveMode(req as any, res));
router.post('/aggressive-mode', requireRole('ADMIN'), (req, res) => controller.toggleAggressiveMode(req as any, res));

// Epic 1: Reputation Monitor
router.get('/reputation', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getReputationStatus(req as any, res));

// Agent Registry CRUD
router.get('/registry', (req, res) => controller.getAgentRegistry(req as any, res));
router.post('/registry', requireRole('ADMIN'), (req, res) => controller.createAgent(req as any, res));
router.patch('/registry/:id/status', requireRole('ADMIN'), (req, res) => controller.updateAgentStatus(req as any, res));
router.delete('/registry/:id', requireRole('ADMIN'), (req, res) => controller.deleteAgent(req as any, res));

export default router;
