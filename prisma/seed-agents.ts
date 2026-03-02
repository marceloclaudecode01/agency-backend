import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AGENTS = [
  { name: 'Motor Autônomo', function: 'content-engine', description: 'Geração de posts diários', autonomyLevel: 5, cronExpression: '0 7 * * *' },
  { name: 'Métricas', function: 'metrics-collector', description: 'Análise de engajamento', autonomyLevel: 5, cronExpression: '0 8 * * *' },
  { name: 'Token Monitor', function: 'token-monitor', description: 'Renovação de tokens', autonomyLevel: 5, cronExpression: '0 9 * * *' },
  { name: 'Produtos TikTok', function: 'tiktok-products', description: 'Posts de produtos TikTok', autonomyLevel: 5, cronExpression: '0 10,15 * * *' },
  { name: 'Vídeo Motivacional', function: 'motivational-video', description: 'Geração de vídeos motivacionais', autonomyLevel: 5, cronExpression: '0 6,12,18 * * *' },
  { name: 'Tendências', function: 'trending-topics', description: 'Análise de temas em alta', autonomyLevel: 5, cronExpression: '0 6 * * 1' },
  { name: 'Scheduler', function: 'post-scheduler', description: 'Publicação de posts agendados', autonomyLevel: 5, cronExpression: '*/5 * * * *' },
  { name: 'Comentários', function: 'comment-responder', description: 'Resposta automática a comentários', autonomyLevel: 3, cronExpression: '*/30 * * * *' },
  { name: 'Prazos', function: 'deadline-notifier', description: 'Notificação de tarefas', autonomyLevel: 5, cronExpression: '0 8 * * *' },
  { name: 'Content Governor', function: 'content-governor', description: 'Aprovação/rejeição de posts', autonomyLevel: 5, cronExpression: '*/10 * * * *' },
  { name: 'Growth Director', function: 'growth-director', description: 'Ajuste de estratégia semanal', autonomyLevel: 5, cronExpression: '0 22 * * 0' },
  { name: 'A/B Testing', function: 'ab-testing', description: 'Testes A/B de conteúdo', autonomyLevel: 5, cronExpression: '0 */6 * * *' },
  { name: 'Viral Mechanics', function: 'viral-mechanics', description: 'Hooks e gatilhos virais', autonomyLevel: 5, cronExpression: null },
  { name: 'Reputation Monitor', function: 'reputation-monitor', description: 'Monitoramento de reputação', autonomyLevel: 3, cronExpression: '0 */2 * * *' },
  { name: 'Lead Capture', function: 'lead-capture', description: 'Captura de leads em comentários', autonomyLevel: 5, cronExpression: '*/30 * * * *' },
  { name: 'Monetization Engine', function: 'monetization-engine', description: 'Análise de funis e conversões', autonomyLevel: 5, cronExpression: '0 11 * * *' },
  { name: 'Strategic Command', function: 'strategic-command', description: 'Plano estratégico mensal', autonomyLevel: 5, cronExpression: '0 3 1 * *' },
  { name: 'Market Intelligence', function: 'market-intelligence', description: 'Coleta de intel de mercado', autonomyLevel: 5, cronExpression: '0 4 * * 3,6' },
  { name: 'Niche Learning', function: 'niche-learning', description: 'Aprendizado de audiência', autonomyLevel: 5, cronExpression: '0 5 * * 0' },
  { name: 'Paid Traffic', function: 'paid-traffic', description: 'Sync de campanhas ads', autonomyLevel: 3, cronExpression: '0 */4 * * *' },
  { name: 'Ad Creative', function: 'ad-creative', description: 'Geração de criativos', autonomyLevel: 5, cronExpression: null },
  { name: 'Policy Compliance', function: 'policy-compliance', description: 'Verificação de políticas', autonomyLevel: 5, cronExpression: null },
  { name: 'Pattern Variation', function: 'pattern-variation', description: 'Evita repetitividade', autonomyLevel: 5, cronExpression: null },
  { name: 'System Sentinel', function: 'system-sentinel', description: 'Monitoramento de saúde do sistema', autonomyLevel: 5, cronExpression: '*/5 * * * *' },
  { name: 'Performance Learner', function: 'performance-learner', description: 'Aprendizado de performance', autonomyLevel: 5, cronExpression: '0 */6 * * *' },
  { name: 'Brand Brain', function: 'brand-brain', description: 'Consistência de marca', autonomyLevel: 5, cronExpression: null },
  { name: 'Content Strategist', function: 'content-strategist', description: 'Estratégia de conteúdo', autonomyLevel: 5, cronExpression: null },
  { name: 'Orchestrator', function: 'orchestrator', description: 'Orquestração de agentes', autonomyLevel: 5, cronExpression: null },
  { name: 'Facebook Publisher', function: 'facebook-publisher', description: 'Publicação no Facebook', autonomyLevel: 5, cronExpression: null },
  { name: 'Instagram Sync', function: 'instagram-sync', description: 'Sync Instagram via Meta', autonomyLevel: 5, cronExpression: null },
  { name: 'Campaign Manager', function: 'campaign-manager', description: 'Gestão de campanhas', autonomyLevel: 3, cronExpression: null },
  { name: 'ROI Intel', function: 'roi-intel', description: 'Análise de ROI', autonomyLevel: 5, cronExpression: null },
  { name: 'Safe Mode', function: 'safe-mode', description: 'Modo seguro do sistema', autonomyLevel: 5, cronExpression: null },
  { name: 'Anti-Spam Guard', function: 'anti-spam', description: 'Proteção anti-spam', autonomyLevel: 5, cronExpression: null },
  { name: 'Anti-Loop Guard', function: 'anti-loop', description: 'Proteção anti-loop', autonomyLevel: 5, cronExpression: null },
  { name: 'Sentiment Analyzer', function: 'sentiment-analyzer', description: 'Análise de sentimento', autonomyLevel: 5, cronExpression: null },
  { name: 'Dashboard Reporter', function: 'dashboard-reporter', description: 'Relatórios do dashboard', autonomyLevel: 5, cronExpression: null },
  { name: 'Notification Dispatcher', function: 'notification-dispatcher', description: 'Envio de notificações', autonomyLevel: 5, cronExpression: null },
  { name: 'Orion AI', function: 'orion-chat', description: 'Cérebro central da agência', autonomyLevel: 1, cronExpression: null },
];

async function main() {
  console.log('Seeding agents...');
  for (const agent of AGENTS) {
    await prisma.agent.upsert({
      where: { name: agent.name },
      create: {
        name: agent.name,
        function: agent.function,
        description: agent.description,
        autonomyLevel: agent.autonomyLevel,
        cronExpression: agent.cronExpression,
        status: 'active',
      },
      update: {
        function: agent.function,
        description: agent.description,
        autonomyLevel: agent.autonomyLevel,
        cronExpression: agent.cronExpression,
      },
    });
  }
  console.log(`${AGENTS.length} agents seeded.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
