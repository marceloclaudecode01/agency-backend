import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { NotificationsController } from './notifications.controller';

const router = Router();
const controller = new NotificationsController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.getAll(req as any, res));
router.patch('/read-all', (req, res) => controller.markAllAsRead(req as any, res));
router.patch('/:id/read', (req, res) => controller.markAsRead(req as any, res));

export default router;
