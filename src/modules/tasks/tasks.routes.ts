import { Router } from 'express';
import { TasksController } from './tasks.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { createTaskSchema, updateTaskSchema, updateTaskStatusSchema } from './tasks.schema';

const router = Router();
const controller = new TasksController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.findAll(req, res));
router.get('/:id', (req, res) => controller.findById(req, res));
router.post('/', validate(createTaskSchema), (req, res) => controller.create(req, res));
router.put('/:id', validate(updateTaskSchema), (req, res) => controller.update(req, res));
router.patch('/:id/status', validate(updateTaskStatusSchema), (req, res) => controller.updateStatus(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
