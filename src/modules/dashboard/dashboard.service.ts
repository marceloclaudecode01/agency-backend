import prisma from '../../config/database';

export class DashboardService {
  async getSummary(userId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      activeClients,
      activeCampaigns,
      pendingTasks,
      monthRevenue,
      recentCampaigns,
      userTasks,
      recentClients,
      revenueByMonth,
    ] = await Promise.all([
      prisma.client.count({ where: { status: 'ACTIVE' } }),
      prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      prisma.task.count({ where: { status: { not: 'DONE' } } }),
      prisma.invoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.campaign.findMany({
        where: { status: 'ACTIVE' },
        include: {
          client: { select: { id: true, name: true } },
          tasks: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.task.findMany({
        where: { assigneeId: userId, status: { not: 'DONE' } },
        include: {
          campaign: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      prisma.client.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, company: true, status: true, createdAt: true },
      }),
      prisma.invoice.findMany({
        where: { status: 'PAID', paidAt: { gte: sixMonthsAgo } },
        select: { amount: true, paidAt: true, createdAt: true },
        orderBy: { paidAt: 'asc' },
      }),
    ]);

    // Group revenue by month
    const revenueMap: Record<string, number> = {};
    revenueByMonth.forEach((inv) => {
      const date = inv.paidAt || inv.createdAt;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      revenueMap[key] = (revenueMap[key] || 0) + inv.amount;
    });
    const revenueChart = Object.entries(revenueMap).map(([month, total]) => ({ month, total }));

    const campaignsWithProgress = recentCampaigns.map((c) => {
      const total = c.tasks.length;
      const done = c.tasks.filter((t) => t.status === 'DONE').length;
      return {
        id: c.id,
        name: c.name,
        client: c.client,
        status: c.status,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        totalTasks: total,
        doneTasks: done,
      };
    });

    return {
      kpis: {
        activeClients,
        activeCampaigns,
        pendingTasks,
        monthRevenue: monthRevenue._sum.amount || 0,
      },
      revenueChart,
      recentCampaigns: campaignsWithProgress,
      myTasks: userTasks,
      recentClients,
    };
  }
}
