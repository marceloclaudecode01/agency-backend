import { Router } from 'express';
import { CalendarController } from './calendar.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { createEventSchema, updateEventSchema } from './calendar.schema';

const router = Router();
const controller = new CalendarController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.findAll(req, res));
router.get('/:id', (req, res) => controller.findById(req, res));
router.post('/', validate(createEventSchema), (req, res) => controller.create(req, res));
router.put('/:id', validate(updateEventSchema), (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
