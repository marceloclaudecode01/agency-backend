import { Router } from 'express';
import { SocialController } from './social.controller';
import { authMiddleware, requireRole } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { publishPostSchema } from './social.schema';

const router = Router();
const controller = new SocialController();

router.use(authMiddleware);

// Status da conexão com o Facebook
router.get('/connection', (req, res) => controller.checkConnection(req as any, res));

// Informações da página
router.get('/page', (req, res) => controller.getPageInfo(req as any, res));

// Métricas / insights
router.get('/insights', (req, res) => controller.getInsights(req, res));

// Posts publicados
router.get('/posts', (req, res) => controller.getPosts(req, res));

// Posts agendados
router.get('/posts/scheduled', (req, res) => controller.getScheduledPosts(req as any, res));

// Publicar / agendar post (ADMIN, MANAGER)
router.post('/posts', requireRole('ADMIN', 'MANAGER'), validate(publishPostSchema), (req, res) => controller.publishPost(req as any, res));

// Deletar post (ADMIN)
router.delete('/posts/:postId', requireRole('ADMIN'), (req, res) => controller.deletePost(req as any, res));

// Comentários de um post
router.get('/posts/:postId/comments', (req, res) => controller.getPostComments(req, res));

export default router;
