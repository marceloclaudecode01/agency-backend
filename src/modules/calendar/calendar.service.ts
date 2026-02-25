import prisma from '../../config/database';

export class CalendarService {
  async findAll(query: { month?: string; year?: string; userId?: string; campaignId?: string }) {
    const where: any = {};

    if (query.month && query.year) {
      const year = parseInt(query.year);
      const month = parseInt(query.month) - 1;
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
      where.date = { gte: startOfMonth, lte: endOfMonth };
    }

    if (query.userId) where.userId = query.userId;
    if (query.campaignId) where.campaignId = query.campaignId;

    return prisma.calendarEvent.findMany({
      where,
      include: {
        campaign: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { date: 'asc' },
    });
  }

  async findById(id: string) {
    const event = await prisma.calendarEvent.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
    if (!event) throw { statusCode: 404, message: 'Event not found' };
    return event;
  }

  async create(data: any) {
    const processedData = { ...data };
    processedData.date = new Date(data.date);
    if (data.endDate) processedData.endDate = new Date(data.endDate);

    return prisma.calendarEvent.create({
      data: processedData,
      include: {
        campaign: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  async update(id: string, data: any) {
    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw { statusCode: 404, message: 'Event not found' };

    const processedData = { ...data };
    if (data.date) processedData.date = new Date(data.date);
    if (data.endDate) processedData.endDate = new Date(data.endDate);

    return prisma.calendarEvent.update({
      where: { id },
      data: processedData,
      include: {
        campaign: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  async delete(id: string) {
    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw { statusCode: 404, message: 'Event not found' };
    return prisma.calendarEvent.delete({ where: { id } });
  }
}
