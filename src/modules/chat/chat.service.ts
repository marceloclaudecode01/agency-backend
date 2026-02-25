import prisma from '../../config/database';

export class ChatService {
  async getConversation(userId: string, otherId: string) {
    return prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId },
        ],
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markAsRead(userId: string, senderId: string) {
    return prisma.message.updateMany({
      where: { senderId, receiverId: userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCounts(userId: string) {
    const messages = await prisma.message.groupBy({
      by: ['senderId'],
      where: { receiverId: userId, read: false },
      _count: { id: true },
    });
    const result: Record<string, number> = {};
    for (const m of messages) {
      result[m.senderId] = m._count.id;
    }
    return result;
  }
}
