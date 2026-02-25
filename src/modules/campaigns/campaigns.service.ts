import prisma from '../../config/database';

export class CampaignsService {
  async findAll(query: { status?: string; clientId?: string; search?: string }) {
    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return prisma.campaign.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, company: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, company: true } },
        tasks: {
          include: { assignee: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
        },
        budgets: true,
        calendarEvents: true,
      },
    });

    if (!campaign) {
      throw { statusCode: 404, message: 'Campaign not found' };
    }

    return campaign;
  }

  async create(data: any) {
    const processedData = { ...data };
    if (data.startDate) processedData.startDate = new Date(data.startDate);
    if (data.endDate) processedData.endDate = new Date(data.endDate);

    return prisma.campaign.create({
      data: processedData,
      include: {
        client: { select: { id: true, name: true, company: true } },
      },
    });
  }

  async update(id: string, data: any) {
    await this.findById(id);
    const processedData = { ...data };
    if (data.startDate) processedData.startDate = new Date(data.startDate);
    if (data.endDate) processedData.endDate = new Date(data.endDate);

    return prisma.campaign.update({
      where: { id },
      data: processedData,
      include: {
        client: { select: { id: true, name: true, company: true } },
      },
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return prisma.campaign.delete({ where: { id } });
  }
}
