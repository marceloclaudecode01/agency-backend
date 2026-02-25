import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { registerSchema, loginSchema, updateProfileSchema } from './auth.schema';

const router = Router();
const controller = new AuthController();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts, try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many registrations from this IP' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', registerLimiter, validate(registerSchema), (req, res) => controller.register(req, res));
router.post('/login', loginLimiter, validate(loginSchema), (req, res) => controller.login(req, res));
router.get('/me', authMiddleware, (req, res) => controller.me(req, res));
router.put('/profile', authMiddleware, validate(updateProfileSchema), (req, res) => controller.updateProfile(req, res));

export default router;
