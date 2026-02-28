import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { errorHandler } from './middlewares/error-handler';
import prisma from './config/database';

import authRoutes from './modules/auth/auth.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import clientsRoutes from './modules/clients/clients.routes';
import campaignsRoutes from './modules/campaigns/campaigns.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import tasksRoutes from './modules/tasks/tasks.routes';
import financeRoutes from './modules/finance/finance.routes';
import reportsRoutes from './modules/reports/reports.routes';
import calendarRoutes from './modules/calendar/calendar.routes';
import usersRoutes from './modules/users/users.routes';
import socialRoutes from './modules/social/social.routes';
import agentsRoutes from './modules/agents/agents.routes';
import productsRoutes from './modules/products/products.routes';
import chatRoutes from './modules/chat/chat.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import { startAllAgents } from './agents/scheduler.agent';
import { setAgentLoggerIo } from './agents/agent-logger';

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}

const JWT_SECRET = process.env.JWT_SECRET;
const app = express();
const PORT = process.env.PORT || 3333;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Rate limit geral
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.2.0' });
});

// Temporary test endpoint for motivational video (remove after testing)
app.post('/api/test/motivational', async (_req, res) => {
  try {
    const { generateMotivationalVideo } = await import('./agents/motivational-video.agent');
    await generateMotivationalVideo();
    res.json({ success: true, message: 'Vídeo motivacional gerado e agendado' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Force publish now - bypasses scheduler wait
app.post('/api/test/publish-now', async (_req, res) => {
  try {
    const { SocialService } = await import('./modules/social/social.service');
    const socialService = new SocialService();
    const post = await prisma.scheduledPost.findFirst({
      where: { status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!post) return res.status(404).json({ success: false, error: 'Nenhum post APPROVED encontrado' });
    const fullMessage = post.hashtags ? `${post.message}\n\n${post.hashtags}` : post.message;
    const result = post.imageUrl
      ? await socialService.publishMediaPost(fullMessage, post.imageUrl)
      : await socialService.publishPost(fullMessage);
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    res.json({ success: true, fbPostId: result?.id, topic: post.topic, message: fullMessage.substring(0, 100) });
  } catch (err: any) {
    const fbError = err.response?.data || err.message;
    res.status(500).json({ success: false, error: err.message, fbDetail: fbError, imageUrl: (await prisma.scheduledPost.findFirst({ where: { status: 'APPROVED' }, orderBy: { createdAt: 'desc' } }))?.imageUrl });
  }
});

// Error handler
app.use(errorHandler);

// HTTP server + Socket.io
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    socket.data.user = decoded;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// Socket.io events
io.on('connection', (socket) => {
  const userId = socket.data.user.id;
  socket.join(`user:${userId}`);

  socket.on('chat:message', async ({ receiverId, content }: { receiverId: string; content: string }) => {
    if (!content || typeof content !== 'string' || content.trim().length === 0) return;
    if (content.length > 5000) return;
    if (!receiverId || typeof receiverId !== 'string') return;
    if (receiverId === userId) return;

    try {
      const receiver = await prisma.user.findUnique({ where: { id: receiverId }, select: { id: true } });
      if (!receiver) return;

      const msg = await prisma.message.create({
        data: { content: content.trim(), senderId: userId, receiverId },
        include: { sender: { select: { id: true, name: true, avatar: true } } },
      });
      io.to(`user:${receiverId}`).emit('chat:message', msg);
      io.to(`user:${userId}`).emit('chat:message', msg);
    } catch (err) {
      console.error('[Socket] chat:message error:', err);
    }
  });

  socket.on('disconnect', () => {});
});

// Global error handlers - prevent crash
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err.message);
  import('./agents/agent-logger').then(({ agentLog }) => {
    agentLog('Sistema', `🔴 Erro não capturado: ${err.message}`, { type: 'error' }).catch(() => {});
  });
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[CRITICAL] Unhandled Rejection:', reason?.message || reason);
  import('./agents/agent-logger').then(({ agentLog }) => {
    agentLog('Sistema', `🔴 Promise rejeitada: ${reason?.message || reason}`, { type: 'error' }).catch(() => {});
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  setAgentLoggerIo(io);
  startAllAgents();
});

export default app;
