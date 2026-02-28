import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth';

const router = Router();
const controller = new AnalyticsController();

router.use(authMiddleware);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/overview', (req, res) => controller.getOverview(req, res));
router.get('/posts', (req, res) => controller.getPostsRanking(req, res));
router.get('/best-times', (req, res) => controller.getBestTimes(req, res));
router.get('/agents', (req, res) => controller.getAgentActivity(req, res));

export default router;
