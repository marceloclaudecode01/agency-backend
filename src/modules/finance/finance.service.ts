import prisma from '../../config/database';

export class FinanceService {
  // Budgets
  async findAllBudgets(query: { clientId?: string; status?: string }) {
    const where: any = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status;

    return prisma.budget.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, company: true } },
        campaign: { select: { id: true, name: true } },
        _count: { select: { invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBudget(data: any) {
    const processedData = { ...data };
    if (data.items) processedData.items = JSON.parse(JSON.stringify(data.items));

    return prisma.budget.create({
      data: processedData,
      include: {
        client: { select: { id: true, name: true, company: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  }

  async updateBudget(id: string, data: any) {
    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) throw { statusCode: 404, message: 'Budget not found' };

    const processedData = { ...data };
    if (data.items) processedData.items = JSON.parse(JSON.stringify(data.items));

    return prisma.budget.update({
      where: { id },
      data: processedData,
      include: {
        client: { select: { id: true, name: true, company: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  }

  async findBudgetById(id: string) {
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, company: true } },
        campaign: { select: { id: true, name: true } },
        invoices: { include: { client: { select: { id: true, name: true } } } },
      },
    });
    if (!budget) throw { statusCode: 404, message: 'Budget not found' };
    return budget;
  }

  async deleteBudget(id: string) {
    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) throw { statusCode: 404, message: 'Budget not found' };
    return prisma.budget.delete({ where: { id } });
  }

  // Invoices
  async findAllInvoices(query: { clientId?: string; status?: string }) {
    const where: any = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status;

    return prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, company: true } },
        budget: { select: { id: true, total: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvoice(data: any) {
    const processedData = { ...data };
    if (data.dueDate) processedData.dueDate = new Date(data.dueDate);

    return prisma.invoice.create({
      data: processedData,
      include: {
        client: { select: { id: true, name: true, company: true } },
        budget: { select: { id: true, total: true, status: true } },
      },
    });
  }

  async updateInvoice(id: string, data: any) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };

    const processedData = { ...data };
    if (data.dueDate) processedData.dueDate = new Date(data.dueDate);
    if (data.status === 'PAID' && !processedData.paidAt) processedData.paidAt = new Date();

    return prisma.invoice.update({
      where: { id },
      data: processedData,
      include: {
        client: { select: { id: true, name: true, company: true } },
        budget: { select: { id: true, total: true, status: true } },
      },
    });
  }

  async findInvoiceById(id: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, company: true } },
        budget: { select: { id: true, total: true, status: true } },
      },
    });
    if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };
    return invoice;
  }

  async deleteInvoice(id: string) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };
    return prisma.invoice.delete({ where: { id } });
  }

  // Summary
  async getSummary(query: { startDate?: string; endDate?: string }) {
    const where: any = {};
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [totalRevenue, pendingInvoices, paidInvoices, totalBudgets] = await Promise.all([
      prisma.invoice.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      prisma.invoice.aggregate({ where: { ...where, status: 'PAID' }, _count: true }),
      prisma.budget.aggregate({ where: { ...where, status: 'APPROVED' }, _sum: { total: true } }),
    ]);

    return {
      totalRevenue: totalRevenue._sum.amount || 0,
      pendingAmount: pendingInvoices._sum.amount || 0,
      pendingCount: pendingInvoices._count,
      paidCount: paidInvoices._count,
      approvedBudgetsTotal: totalBudgets._sum.total || 0,
    };
  }
}
