import prisma from '../../config/database';

class NotificationsService {
  async getByUser(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    return prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async createAndEmit(userId: string, type: string, title: string, message: string, taskId?: string) {
    const notif = await prisma.notification.create({
      data: { userId, type, title, message, taskId },
    });

    // Import io aqui para evitar circular dependency
    try {
      const { io } = await import('../../server');
      io.to(`user:${userId}`).emit('notification', notif);
    } catch {}

    return notif;
  }
}

export const notificationsService = new NotificationsService();
