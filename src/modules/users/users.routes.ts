import { Router } from 'express';
import { UsersController } from './users.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware, requireRole } from '../../middlewares/auth';
import { createUserSchema, updateUserSchema } from './users.schema';

const router = Router();
const controller = new UsersController();

router.use(authMiddleware);
router.use(requireRole('ADMIN', 'MANAGER'));

router.get('/', (req, res) => controller.findAll(req, res));
router.get('/:id', (req, res) => controller.findById(req, res));
router.post('/', validate(createUserSchema), (req, res) => controller.create(req, res));
router.put('/:id', validate(updateUserSchema), (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
