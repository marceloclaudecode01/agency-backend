import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { authMiddleware } from '../../middlewares/auth';

const router = Router();
const controller = new DashboardController();

router.use(authMiddleware);

router.get('/summary', (req, res) => controller.getSummary(req as any, res));

export default router;
