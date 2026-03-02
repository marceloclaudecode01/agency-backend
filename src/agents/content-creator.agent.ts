import { askGemini } from './gemini';
import { getBrandContext } from './brand-brain.agent';

const PAGE_CONTEXT = `
Você é o agente de conteúdo de uma página de ALTO CRESCIMENTO no Facebook.
OBJETIVO: Criar conteúdo viral que gere compartilhamentos, comentários e salvamentos.

REGRAS ABSOLUTAS:
- NÃO produzir conteúdo sobre streamers, filmes, séries ou entretenimento genérico.
- Focar em: dicas práticas, insights poderosos, tendências, conhecimento útil, provocações inteligentes.
- Cada post DEVE entregar valor real ao leitor.
- Tom: inteligente, direto, humano, alternando entre educativo, inspirador e provocativo.
- Público: brasileiros que buscam crescimento, conhecimento e conteúdo que vale compartilhar.
- SEMPRE em português do Brasil.

FORMATOS DE ALTO ALCANCE (priorizar):
- Listas numeradas (ex: "5 coisas que...")
- Perguntas provocativas que geram debate
- Dicas práticas aplicáveis imediatamente
- Fatos surpreendentes / curiosidades
- Mini tutoriais em texto
- Conteúdo "salvável" (checklists, resumos)

GATILHOS DE ENGAJAMENTO (usar sempre):
- Perguntas abertas no final
- "Marca alguém que precisa ver isso"
- "Salva pra não esquecer"
- "Concorda ou discorda?"
- Pedir opinião / experiência pessoal
`;

export interface GeneratedPost {
  message: string;
  hashtags: string[];
  suggestedTime: string;
  topic: string;
  contentCategory: string;
}

export async function generatePost(topic: string, extraContext?: string): Promise<GeneratedPost> {
  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  const prompt = `
${PAGE_CONTEXT}
${brandCtx}

Crie um post para o Facebook sobre o seguinte tema: "${topic}"
${extraContext ? `Contexto adicional: ${extraContext}` : ''}

Retorne APENAS um JSON válido neste formato exato:
{
  "message": "texto do post aqui (sem hashtags, máx 500 caracteres, use quebras de linha para legibilidade)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "suggestedTime": "HH:MM",
  "topic": "${topic}",
  "contentCategory": "educativo|engajamento|autoridade|bastidores"
}

Regras:
- A mensagem DEVE ser envolvente, original e entregar valor real
- Use quebras de linha (\\n) para formatar bem o texto
- SEMPRE termine com uma chamada para ação que gere interação
- As hashtags devem ser populares e relevantes em português
- O horário sugerido deve ser entre 08:00 e 22:00
- Não inclua as hashtags na mensagem
- NÃO fale sobre filmes, séries, streaming ou TV
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
    educativo: 'Ensine algo prático e aplicável. Dica, tutorial, checklist ou "como fazer". O leitor deve sair sabendo algo novo.',
    engajamento: 'Faça uma pergunta provocativa, crie debate, peça opinião. Objetivo: máximo de comentários e compartilhamentos.',
    autoridade: 'Mostre expertise com dados, análise inteligente, tendência ou estudo de caso. Posicione como referência.',
    bastidores: 'Humanize com bastidores, aprendizado pessoal, processo, desafio superado ou história real. Conexão emocional.',
    novidade: 'Apresente uma tendência quente, novidade útil ou fato surpreendente. Tom informativo mas empolgante.',
    cta: 'Crie conteúdo tão bom que o leitor queira compartilhar. Inclua "marca alguém" ou "salva pra depois".',
  };

  const focusGuide = focusInstructions[focusType] || focusInstructions['educativo'];
  const recentStr = recentTopics.length > 0 ? recentTopics.join(', ') : 'nenhum';

  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  const prompt = `
${PAGE_CONTEXT}
${brandCtx}

INSTRUÇÃO DE FORMATO: Varie SEMPRE o formato. Alterne entre:
- Lista numerada
- Pergunta provocativa
- Dica prática direta
- Fato surpreendente + análise
- Mini tutorial passo a passo
- Opinião controversa (polêmica leve e inteligente)

Crie um post para o Facebook sobre o tema: "${topic}"
Tipo de foco: ${focusType} — ${focusGuide}

IMPORTANTE: NÃO repita esses temas recentes: ${recentStr}
PROIBIDO: Falar sobre filmes, séries, streaming, TV, streamers.

Retorne APENAS um JSON válido neste formato exato:
{
  "message": "texto do post aqui (sem hashtags, máx 500 caracteres, use \\n para quebras de linha)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "suggestedTime": "HH:MM",
  "topic": "${topic}",
  "contentCategory": "${focusType}"
}

Regras:
- A mensagem DEVE ser envolvente, original e viral
- Use formatação com quebras de linha para facilitar leitura
- SEMPRE inclua CTA que estimule interação (pergunta, marca alguém, salva)
- As hashtags devem ser populares em português
- Horário sugerido entre 08:00 e 22:00
- Não inclua as hashtags na mensagem
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response from Gemini');
  return JSON.parse(jsonMatch[0]);
}

export async function generateWeeklyPlan(focus: string): Promise<GeneratedPost[]> {
  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  const prompt = `
${PAGE_CONTEXT}
${brandCtx}

Crie um plano de 7 posts para a semana com foco geral em: "${focus}"

DISTRIBUIÇÃO OBRIGATÓRIA na semana:
- 3 posts educativos (dicas, tutoriais, checklists)
- 2 posts de engajamento (perguntas, debates, enquetes)
- 1 post de autoridade (dados, análise, tendência)
- 1 post de bastidores (humanização, história, processo)

Cada dia DEVE ter ângulo, formato e tom DIFERENTES.

Retorne APENAS um JSON válido neste formato:
[
  {
    "message": "texto do post (use \\n para quebras de linha)",
    "hashtags": ["tag1", "tag2", "tag3"],
    "suggestedTime": "19:00",
    "topic": "tema específico do dia",
    "contentCategory": "educativo|engajamento|autoridade|bastidores"
  }
]

Gere exatamente 7 objetos no array, um para cada dia.
Varie os horários entre 08:00 e 22:00.
NÃO fale sobre filmes, séries, streaming ou TV.
`;

  const raw = await askGemini(prompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Invalid response from Gemini');
  return JSON.parse(jsonMatch[0]);
}
