import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { sendMessage, getInventory, getDashboard } from './ai-chat.controller';

const router = Router();

router.post('/message', authMiddleware, sendMessage);
router.get('/inventory', authMiddleware, getInventory);
router.get('/dashboard', authMiddleware, getDashboard);

export default router;
