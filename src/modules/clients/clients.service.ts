import prisma from '../../config/database';

export class ClientsService {
  async findAll(query: { status?: string; search?: string }) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { company: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return prisma.client.findMany({
      where,
      include: {
        _count: { select: { campaigns: true, invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        campaigns: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { createdAt: 'desc' } },
        budgets: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!client) {
      throw { statusCode: 404, message: 'Client not found' };
    }

    return client;
  }

  async create(data: any) {
    return prisma.client.create({ data });
  }

  async update(id: string, data: any) {
    await this.findById(id);
    return prisma.client.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.findById(id);
    return prisma.client.delete({ where: { id } });
  }
}
