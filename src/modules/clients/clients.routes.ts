import { Router } from 'express';
import { ClientsController } from './clients.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { createClientSchema, updateClientSchema } from './clients.schema';

const router = Router();
const controller = new ClientsController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.findAll(req, res));
router.get('/:id', (req, res) => controller.findById(req, res));
router.post('/', validate(createClientSchema), (req, res) => controller.create(req, res));
router.put('/:id', validate(updateClientSchema), (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
