import { Router } from 'express';
import { CampaignsController } from './campaigns.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { createCampaignSchema, updateCampaignSchema } from './campaigns.schema';

const router = Router();
const controller = new CampaignsController();

router.use(authMiddleware);

router.get('/', (req, res) => controller.findAll(req, res));
router.get('/:id', (req, res) => controller.findById(req, res));
router.post('/', validate(createCampaignSchema), (req, res) => controller.create(req, res));
router.put('/:id', validate(updateCampaignSchema), (req, res) => controller.update(req, res));
router.delete('/:id', (req, res) => controller.delete(req, res));

export default router;
