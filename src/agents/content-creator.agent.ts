import { askGemini } from './gemini';

const PAGE_CONTEXT = `
Você é o agente de conteúdo da página "NewPlay Tv Online" no Facebook.
A página é sobre entretenimento, TV online, streaming e cultura pop.
Tom: descontraído, animado, próximo do público, use emojis com moderação.
Público: brasileiros que gostam de entretenimento, filmes, séries e TV ao vivo.
IMPORTANTE: Gere conteúdo em português do Brasil.
`;

export interface GeneratedPost {
  message: string;
  hashtags: string[];
  suggestedTime: string;
  topic: string;
}

export async function generatePost(topic: string, extraContext?: string): Promise<GeneratedPost> {
  const prompt = `
${PAGE_CONTEXT}

Crie um post para o Facebook sobre o seguinte tema: "${topic}"
${extraContext ? `Contexto adicional: ${extraContext}` : ''}

Retorne APENAS um JSON válido neste formato exato:
{
  "message": "texto do post aqui (sem hashtags, máx 300 caracteres)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "suggestedTime": "HH:MM",
  "topic": "${topic}"
}

Regras:
- A mensagem deve ser envolvente e gerar engajamento
- Inclua uma chamada para ação (curta, compartilhe, comente)
- As hashtags devem ser relevantes e populares em português
- O horário sugerido deve ser entre 18:00 e 22:00 (horário nobre)
- Não inclua as hashtags na mensagem, elas ficam separadas
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response from Gemini');
  return JSON.parse(jsonMatch[0]);
}

export async function generatePostFromStrategy(
  topic: string,
  focusType: string,
  recentTopics: string[]
): Promise<GeneratedPost> {
  const focusInstructions: Record<string, string> = {
    entretenimento: 'Tom leve e divertido. Compartilhe algo que vai entreter o público.',
    engajamento: 'Faça uma pergunta ou crie uma enquete. O objetivo é gerar comentários e interação.',
    novidade: 'Apresente uma novidade ou tendência. Tone informativo mas animado.',
    cta: 'Inclua uma chamada para ação clara: curtir a página, compartilhar, ou acessar o serviço.',
  };

  const focusGuide = focusInstructions[focusType] || focusInstructions['entretenimento'];
  const recentStr = recentTopics.length > 0 ? recentTopics.join(', ') : 'nenhum';

  const prompt = `
${PAGE_CONTEXT}

Crie um post para o Facebook sobre o tema: "${topic}"
Tipo de foco: ${focusType} — ${focusGuide}

IMPORTANTE: NÃO repita esses temas recentes: ${recentStr}

Retorne APENAS um JSON válido neste formato exato:
{
  "message": "texto do post aqui (sem hashtags, máx 300 caracteres)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "suggestedTime": "HH:MM",
  "topic": "${topic}"
}

Regras:
- A mensagem deve ser envolvente e original
- Aplique o foco "${focusType}" conforme instruído
- As hashtags devem ser relevantes e populares em português
- O horário sugerido deve ser entre 12:00 e 22:00
- Não inclua as hashtags na mensagem
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response from Gemini');
  return JSON.parse(jsonMatch[0]);
}

export async function generateWeeklyPlan(focus: string): Promise<GeneratedPost[]> {
  const prompt = `
${PAGE_CONTEXT}

Crie um plano de 7 posts para a semana sobre o tema geral: "${focus}"
Cada dia deve ter um ângulo diferente e criativo.

Retorne APENAS um JSON válido neste formato:
[
  {
    "message": "texto do post",
    "hashtags": ["tag1", "tag2", "tag3"],
    "suggestedTime": "19:00",
    "topic": "tema específico do dia"
  }
]

Gere exatamente 7 objetos no array, um para cada dia da semana.
Varie os horários entre 18:00 e 22:00.
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid response from Gemini');
  return JSON.parse(jsonMatch[0]);
}
