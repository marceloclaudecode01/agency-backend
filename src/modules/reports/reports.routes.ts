import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authMiddleware } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/auth';

const router = Router();
const controller = new ReportsController();

router.use(authMiddleware);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/revenue', (req, res) => controller.getRevenue(req, res));
router.get('/campaigns', (req, res) => controller.getCampaignPerformance(req, res));
router.get('/clients', (req, res) => controller.getTopClients(req, res));

export default router;
