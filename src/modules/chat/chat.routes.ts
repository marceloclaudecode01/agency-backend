import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { ChatController } from './chat.controller';

const router = Router();
const controller = new ChatController();

router.use(authMiddleware);

router.get('/unread', (req, res) => controller.getUnreadCounts(req as any, res));
router.get('/:userId', (req, res) => controller.getConversation(req as any, res));
router.patch('/:senderId/read', (req, res) => controller.markAsRead(req as any, res));

export default router;
