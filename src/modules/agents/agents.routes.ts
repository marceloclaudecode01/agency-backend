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

export default router;
