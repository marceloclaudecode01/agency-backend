import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@agency.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@agency.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  // Manager user
  const managerPassword = await bcrypt.hash('manager123', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@agency.com' },
    update: {},
    create: {
      name: 'Maria Manager',
      email: 'manager@agency.com',
      password: managerPassword,
      role: 'MANAGER',
    },
  });

  // Member user
  const memberPassword = await bcrypt.hash('member123', 10);
  const member = await prisma.user.upsert({
    where: { email: 'member@agency.com' },
    update: {},
    create: {
      name: 'João Designer',
      email: 'member@agency.com',
      password: memberPassword,
      role: 'MEMBER',
    },
  });

  // Clients
  const client1 = await prisma.client.upsert({
    where: { id: 'seed-client-1' },
    update: {},
    create: {
      id: 'seed-client-1',
      name: 'Tech Solutions Ltda',
      email: 'contato@techsolutions.com',
      phone: '(11) 99999-0001',
      company: 'Tech Solutions',
      status: 'ACTIVE',
      notes: 'Cliente prioritário, foco em redes sociais e SEO.',
    },
  });

  const client2 = await prisma.client.upsert({
    where: { id: 'seed-client-2' },
    update: {},
    create: {
      id: 'seed-client-2',
      name: 'Boutique Moda',
      email: 'marketing@boutiquemoda.com',
      phone: '(11) 99999-0002',
      company: 'Boutique Moda',
      status: 'ACTIVE',
      notes: 'Foco em Instagram e campanhas sazonais.',
    },
  });

  const client3 = await prisma.client.upsert({
    where: { id: 'seed-client-3' },
    update: {},
    create: {
      id: 'seed-client-3',
      name: 'Carlos Empreendimentos',
      email: 'carlos@empreendimentos.com',
      phone: '(11) 99999-0003',
      company: 'Carlos Empreendimentos',
      status: 'LEAD',
      notes: 'Lead qualificado, aguardando proposta.',
    },
  });

  // Campaigns
  const campaign1 = await prisma.campaign.upsert({
    where: { id: 'seed-campaign-1' },
    update: {},
    create: {
      id: 'seed-campaign-1',
      name: 'Lançamento App Mobile',
      description: 'Campanha de lançamento do novo aplicativo mobile da Tech Solutions.',
      clientId: client1.id,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      budget: 15000,
      goals: 'Alcançar 10k downloads no primeiro mês.',
    },
  });

  const campaign2 = await prisma.campaign.upsert({
    where: { id: 'seed-campaign-2' },
    update: {},
    create: {
      id: 'seed-campaign-2',
      name: 'Coleção Verão 2026',
      description: 'Campanha para coleção de verão com foco em Instagram e TikTok.',
      clientId: client2.id,
      status: 'ACTIVE',
      startDate: new Date('2025-11-01'),
      endDate: new Date('2026-02-28'),
      budget: 8000,
      goals: 'Aumentar seguidores em 30% e vendas online em 20%.',
    },
  });

  // Tasks
  await prisma.task.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-task-1',
        title: 'Criar artes para stories',
        description: 'Desenvolver 10 artes para stories do Instagram da campanha de verão.',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assigneeId: member.id,
        campaignId: campaign2.id,
        dueDate: new Date('2026-02-28'),
      },
      {
        id: 'seed-task-2',
        title: 'Configurar Google Ads',
        description: 'Criar campanhas no Google Ads para o lançamento do app.',
        status: 'TODO',
        priority: 'URGENT',
        assigneeId: manager.id,
        campaignId: campaign1.id,
        dueDate: new Date('2026-02-27'),
      },
      {
        id: 'seed-task-3',
        title: 'Relatório mensal de métricas',
        description: 'Compilar relatório de performance de janeiro.',
        status: 'DONE',
        priority: 'MEDIUM',
        assigneeId: manager.id,
        campaignId: campaign1.id,
      },
      {
        id: 'seed-task-4',
        title: 'Produção de vídeo institucional',
        description: 'Roteiro e gravação do vídeo institucional para o site.',
        status: 'TODO',
        priority: 'MEDIUM',
        assigneeId: member.id,
        campaignId: campaign2.id,
        dueDate: new Date('2026-03-15'),
      },
    ],
  });

  // Budget
  const budget1 = await prisma.budget.upsert({
    where: { id: 'seed-budget-1' },
    update: {},
    create: {
      id: 'seed-budget-1',
      title: 'Proposta Campanha App Mobile',
      clientId: client1.id,
      campaignId: campaign1.id,
      items: [
        { description: 'Gestão de redes sociais (3 meses)', amount: 6000 },
        { description: 'Google Ads - verba de mídia', amount: 5000 },
        { description: 'Produção de conteúdo', amount: 4000 },
      ],
      total: 15000,
      status: 'APPROVED',
    },
  });

  // Invoice
  await prisma.invoice.upsert({
    where: { id: 'seed-invoice-1' },
    update: {},
    create: {
      id: 'seed-invoice-1',
      clientId: client1.id,
      budgetId: budget1.id,
      amount: 5000,
      status: 'PAID',
      dueDate: new Date('2026-01-31'),
      paidAt: new Date('2026-01-28'),
    },
  });

  await prisma.invoice.upsert({
    where: { id: 'seed-invoice-2' },
    update: {},
    create: {
      id: 'seed-invoice-2',
      clientId: client1.id,
      budgetId: budget1.id,
      amount: 5000,
      status: 'PENDING',
      dueDate: new Date('2026-02-28'),
    },
  });

  // Calendar events
  await prisma.calendarEvent.createMany({
    skipDuplicates: true,
    data: [
      {
        id: 'seed-event-1',
        title: 'Reunião de alinhamento — Tech Solutions',
        description: 'Revisão de métricas e planejamento Q1.',
        type: 'MEETING',
        date: new Date('2026-02-26T10:00:00'),
        endDate: new Date('2026-02-26T11:00:00'),
        campaignId: campaign1.id,
        userId: admin.id,
      },
      {
        id: 'seed-event-2',
        title: 'Entrega artes — Coleção Verão',
        description: 'Prazo final para entrega das artes da campanha de verão.',
        type: 'DEADLINE',
        date: new Date('2026-02-28T18:00:00'),
        campaignId: campaign2.id,
        userId: member.id,
      },
    ],
  });

  console.log('Seed completed!');
  console.log('Users created:');
  console.log('  admin@agency.com / admin123 (ADMIN)');
  console.log('  manager@agency.com / manager123 (MANAGER)');
  console.log('  member@agency.com / member123 (MEMBER)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
