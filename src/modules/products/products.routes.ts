import { Router } from 'express';
import { ProductsController } from './products.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth';

const router = Router();
const controller = new ProductsController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.list(req as any, res));
router.post('/', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.create(req as any, res));
router.get('/:id', (req, res) => controller.getOne(req as any, res));
router.patch('/:id', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.update(req as any, res));
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.delete(req as any, res));
router.post('/analyze/link', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.analyzeLink(req as any, res));

export default router;
