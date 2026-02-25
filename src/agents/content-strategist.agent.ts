import { askGemini } from './gemini';
import prisma from '../config/database';

export interface DailyStrategy {
  postsToCreate: number;
  topics: string[];
  scheduledTimes: string[];
  focusType: string[];
  reasoning: string;
}

export async function buildDailyStrategy(): Promise<DailyStrategy> {
  // Busca o último relatório de métricas
  const lastReport = await prisma.metricsReport.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  // Busca os últimos 10 posts publicados para evitar repetição
  const recentPosts = await prisma.scheduledPost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 10,
    select: { topic: true, message: true },
  });

  const recentTopics = recentPosts.map((p) => p.topic).filter(Boolean).join(', ');
  const metricsContext = lastReport
    ? `Último relatório de métricas (score ${lastReport.growthScore}/10):
- Resumo: ${lastReport.summary}
- Melhores horários: ${lastReport.bestPostingTimes}
- Recomendações: ${lastReport.recommendations}`
    : 'Nenhum relatório de métricas disponível ainda. Use estratégia padrão.';

  const today = new Date();
  const dayOfWeek = today.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('pt-BR');

  const prompt = `
Você é o estrategista de conteúdo da página "NewPlay Tv Online" no Facebook (entretenimento, TV online, streaming, cultura pop).

Hoje é ${dayOfWeek}, ${dateStr}.

${metricsContext}

Temas publicados recentemente (NÃO repita): ${recentTopics || 'nenhum ainda'}

Com base nesses dados, crie a estratégia de conteúdo para HOJE.

Retorne APENAS um JSON válido neste formato exato:
{
  "postsToCreate": 2,
  "topics": ["tema do post 1", "tema do post 2"],
  "scheduledTimes": ["18:00", "20:30"],
  "focusType": ["entretenimento", "engajamento"],
  "reasoning": "Justificativa breve da estratégia escolhida"
}

Regras:
- postsToCreate: entre 1 e 3 (baseado no engajamento recente; se score < 5, crie 3 para aumentar alcance)
- topics: temas DIFERENTES dos recentes, relevantes para o público (filmes, séries, TV ao vivo, cultura pop, entretenimento)
- scheduledTimes: horários entre 12:00 e 22:00, com pelo menos 2h de intervalo entre eles
- focusType: um desses por post: "entretenimento" | "engajamento" | "novidade" | "cta" (cta = direcionar para link na bio)
- reasoning: 1-2 frases explicando a escolha
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta inválida do Gemini ao criar estratégia');

  const strategy: DailyStrategy = JSON.parse(jsonMatch[0]);

  // Validação e sanitização
  strategy.postsToCreate = Math.max(1, Math.min(3, strategy.postsToCreate));
  strategy.topics = strategy.topics.slice(0, strategy.postsToCreate);
  strategy.scheduledTimes = strategy.scheduledTimes.slice(0, strategy.postsToCreate);
  strategy.focusType = strategy.focusType.slice(0, strategy.postsToCreate);

  return strategy;
}
