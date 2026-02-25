import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { registerSchema, loginSchema, updateProfileSchema } from './auth.schema';

const router = Router();
const controller = new AuthController();

router.post('/register', validate(registerSchema), (req, res) => controller.register(req, res));
router.post('/login', validate(loginSchema), (req, res) => controller.login(req, res));
router.get('/me', authMiddleware, (req, res) => controller.me(req, res));
router.put('/profile', authMiddleware, validate(updateProfileSchema), (req, res) => controller.updateProfile(req, res));

export default router;
