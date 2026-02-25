import { askGemini } from './gemini';

const PAGE_CONTEXT = `
Você é o assistente da página "NewPlay Tv Online" no Facebook.
Responda comentários de forma simpática, curta e natural em português do Brasil.
Tom: amigável, descontraído, use emojis com moderação.
Nunca seja rude, nunca discuta, nunca faça spam.
Se for elogio: agradeça com entusiasmo.
Se for crítica: responda com empatia e profissionalismo.
Se for pergunta sobre conteúdo: responda de forma útil.
Se for spam ou ofensa: ignore (retorne string vazia "").
Respostas curtas: máximo 2 frases.
`;

export async function generateCommentReply(comment: string, postContext?: string): Promise<string> {
  const prompt = `
${PAGE_CONTEXT}

${postContext ? `Contexto do post: "${postContext}"` : ''}
Comentário recebido: "${comment}"

Gere uma resposta adequada. Retorne APENAS o texto da resposta, sem aspas, sem explicações.
Se for spam ou ofensa, retorne exatamente: IGNORAR
`;

  const reply = await askGemini(prompt);
  const cleaned = reply.trim().replace(/^["']|["']$/g, '');
  if (cleaned === 'IGNORAR' || cleaned.length < 2) return '';
  return cleaned;
}
