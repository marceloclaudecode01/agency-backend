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

  async createBudget(data: { title: string; clientId: string; campaignId?: string | null; items?: any[]; total?: number; status?: string }) {
    return prisma.budget.create({
      data: {
        title: data.title,
        clientId: data.clientId,
        campaignId: data.campaignId ?? null,
        items: data.items ? JSON.parse(JSON.stringify(data.items)) : [],
        total: data.total ?? 0,
        status: (data.status as any) ?? 'DRAFT',
      },
      include: {
        client: { select: { id: true, name: true, company: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  }

  async updateBudget(id: string, data: { title?: string; clientId?: string; campaignId?: string | null; items?: any[]; total?: number; status?: string }) {
    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) throw { statusCode: 404, message: 'Budget not found' };

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.campaignId !== undefined) updateData.campaignId = data.campaignId;
    if (data.items !== undefined) updateData.items = JSON.parse(JSON.stringify(data.items));
    if (data.total !== undefined) updateData.total = data.total;
    if (data.status !== undefined) updateData.status = data.status;

    return prisma.budget.update({
      where: { id },
      data: updateData,
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

  async createInvoice(data: { clientId: string; budgetId?: string | null; amount: number; status?: string; dueDate?: string | null }) {
    return prisma.invoice.create({
      data: {
        clientId: data.clientId,
        budgetId: data.budgetId ?? null,
        amount: data.amount,
        status: (data.status as any) ?? 'PENDING',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
      include: {
        client: { select: { id: true, name: true, company: true } },
        budget: { select: { id: true, total: true, status: true } },
      },
    });
  }

  async updateInvoice(id: string, data: { clientId?: string; budgetId?: string | null; amount?: number; status?: string; dueDate?: string | null }) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };

    const updateData: any = {};
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.budgetId !== undefined) updateData.budgetId = data.budgetId;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'PAID') updateData.paidAt = new Date();
    }
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;

    return prisma.invoice.update({
      where: { id },
      data: updateData,
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
