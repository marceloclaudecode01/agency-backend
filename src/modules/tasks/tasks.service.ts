import prisma from '../../config/database';
import { notificationsService } from '../notifications/notifications.service';

export class TasksService {
  async findAll(query: { status?: string; assigneeId?: string; campaignId?: string; priority?: string; search?: string }) {
    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.campaignId) where.campaignId = query.campaignId;
    if (query.priority) where.priority = query.priority;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        campaign: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
    });

    if (!task) {
      throw { statusCode: 404, message: 'Task not found' };
    }

    return task;
  }

  async create(data: any) {
    const processedData = { ...data };
    if (data.dueDate) processedData.dueDate = new Date(data.dueDate);

    const task = await prisma.task.create({
      data: processedData,
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    if (task.assigneeId) {
      await notificationsService.createAndEmit(
        task.assigneeId,
        'TASK_ASSIGNED',
        'Nova tarefa atribuída',
        `Você foi atribuído à tarefa "${task.title}"`,
        task.id
      );
    }

    return task;
  }

  async update(id: string, data: any) {
    const existing = await this.findById(id);
    const processedData = { ...data };
    if (data.dueDate) processedData.dueDate = new Date(data.dueDate);

    const task = await prisma.task.update({
      where: { id },
      data: processedData,
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    if (task.assigneeId && task.assigneeId !== existing.assigneeId) {
      await notificationsService.createAndEmit(
        task.assigneeId,
        'TASK_ASSIGNED',
        'Nova tarefa atribuída',
        `Você foi atribuído à tarefa "${task.title}"`,
        task.id
      );
    }

    return task;
  }

  async updateStatus(id: string, status: string) {
    await this.findById(id);
    return prisma.task.update({
      where: { id },
      data: { status: status as any },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return prisma.task.delete({ where: { id } });
  }
}
