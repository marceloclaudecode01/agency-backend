import prisma from '../../config/database';

export class ReportsService {
  async getRevenue(query: { period?: string; startDate?: string; endDate?: string }) {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();

    if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      endDate = new Date(query.endDate);
    } else {
      // Default: last 6 months
      startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: startDate, lte: endDate },
      },
      orderBy: { paidAt: 'asc' },
    });

    // Group by month
    const revenueByMonth: Record<string, number> = {};
    invoices.forEach((inv) => {
      const date = inv.paidAt || inv.createdAt;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth[key] = (revenueByMonth[key] || 0) + inv.amount;
    });

    return Object.entries(revenueByMonth).map(([month, total]) => ({ month, total }));
  }

  async getCampaignPerformance() {
    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return campaigns.map((campaign) => {
      const totalTasks = campaign.tasks.length;
      const doneTasks = campaign.tasks.filter((t) => t.status === 'DONE').length;
      const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        client: campaign.client,
        status: campaign.status,
        totalTasks,
        doneTasks,
        progress,
      };
    });
  }

  async getTopClients() {
    const clients = await prisma.client.findMany({
      where: { status: 'ACTIVE' },
      include: {
        invoices: { where: { status: 'PAID' }, select: { amount: true } },
        _count: { select: { campaigns: true } },
      },
    });

    return clients
      .map((client) => ({
        id: client.id,
        name: client.name,
        company: client.company,
        totalRevenue: client.invoices.reduce((sum, inv) => sum + inv.amount, 0),
        campaignCount: client._count.campaigns,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }
}
