import prisma from '../config/database';
import { askGemini } from './gemini';
import { getBrandContext } from './brand-brain.agent';
import { agentLog } from './agent-logger';

/**
 * Content Replicator Agent
 * Transforms 1 post into multiple formats:
 * - Carousel (slides educativos)
 * - Story (texto curto + CTA)
 * - Video Script (roteiro 15-60s)
 * - Email (newsletter)
 * - Thread (série de posts curtos)
 * - Ad Copy (copy para anúncio)
 */

export type ReplicaFormat = 'carousel' | 'story' | 'video_script' | 'email' | 'thread' | 'ad_copy';

const FORMAT_INSTRUCTIONS: Record<ReplicaFormat, string> = {
  carousel: `Crie um CARROSSEL educativo com 5-7 slides.
Cada slide deve ter:
- "title": título curto e impactante (máx 8 palavras)
- "body": texto explicativo (máx 50 palavras)
- "tip": dica visual ou emoji sugestivo
Slide 1 = capa chamativa. Último slide = CTA forte.
Retorne JSON: { "slides": [...], "caption": "legenda para o post" }`,

  story: `Crie um STORY (texto curto para Instagram/Facebook Stories).
- Máximo 100 caracteres de texto principal
- 1 emoji dominante
- CTA com swipe up ou enquete
Retorne JSON: { "text": "...", "emoji": "🔥", "cta": "...", "pollOptions": ["Sim", "Não"] }`,

  video_script: `Crie um ROTEIRO de vídeo curto (15-30 segundos).
Estrutura:
- "hook": frase de abertura que prende em 3s (máx 15 palavras)
- "body": conteúdo principal, 3-4 frases curtas
- "cta": chamada para ação final
- "visualNotes": sugestões visuais (texto na tela, transições)
- "duration": duração estimada em segundos
Retorne JSON: { "hook": "...", "body": "...", "cta": "...", "visualNotes": "...", "duration": 20 }`,

  email: `Crie um EMAIL de newsletter sobre este conteúdo.
- "subject": linha de assunto irresistível (máx 60 chars)
- "preheader": texto de preview (máx 90 chars)
- "body": corpo do email em HTML simples (parágrafos, negrito, lista)
- "cta": botão de ação com texto e link placeholder
Retorne JSON: { "subject": "...", "preheader": "...", "body": "...", "ctaText": "...", "ctaUrl": "#" }`,

  thread: `Crie uma THREAD (série de 4-6 posts curtos conectados).
Cada post da thread:
- Máximo 280 caracteres
- Numerado (1/, 2/, etc)
- Post 1 = hook forte. Último = CTA.
Retorne JSON: { "posts": ["1/ texto...", "2/ texto...", ...] }`,

  ad_copy: `Crie um COPY DE ANÚNCIO otimizado para conversão.
- "headline": título do anúncio (máx 40 chars)
- "primaryText": texto principal persuasivo (máx 125 chars)
- "description": descrição complementar (máx 30 chars)
- "cta": tipo de botão (LEARN_MORE, SHOP_NOW, SIGN_UP, etc)
Retorne JSON: { "headline": "...", "primaryText": "...", "description": "...", "cta": "LEARN_MORE" }`,
};

export async function replicateContent(
  postId: string,
  formats: ReplicaFormat[],
  platform?: string
): Promise<{ created: number; errors: number }> {
  const post = await prisma.scheduledPost.findUnique({ where: { id: postId } });
  if (!post) throw new Error(`Post ${postId} não encontrado`);

  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  let created = 0;
  let errors = 0;

  for (const format of formats) {
    try {
      const prompt = `Você é um especialista em repurposing de conteúdo para redes sociais brasileiras.
${brandCtx}

POST ORIGINAL:
Tema: "${post.topic}"
Texto: "${post.message.substring(0, 500)}"
Categoria: ${post.contentType || 'organic'}

TAREFA: ${FORMAT_INSTRUCTIONS[format]}

REGRAS:
- Mantenha a essência e valor do conteúdo original
- Adapte para o formato pedido (NÃO copie igual)
- Português do Brasil, tom inteligente e humano
- Retorne APENAS o JSON válido, sem texto extra`;

      const raw = await askGemini(prompt);
      const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) throw new Error(`Resposta inválida para formato ${format}`);

      const parsed = JSON.parse(match[0]);
      const targetPlatform = platform || getPlatformForFormat(format);

      // Extract main content text
      let contentText = '';
      if (format === 'carousel') contentText = parsed.caption || '';
      else if (format === 'story') contentText = parsed.text || '';
      else if (format === 'video_script') contentText = parsed.hook + ' ' + parsed.body;
      else if (format === 'email') contentText = parsed.subject || '';
      else if (format === 'thread') contentText = (parsed.posts || []).join('\n');
      else if (format === 'ad_copy') contentText = parsed.primaryText || '';

      await prisma.contentReplica.create({
        data: {
          originalPostId: postId,
          format,
          platform: targetPlatform,
          content: contentText,
          slides: format === 'carousel' ? parsed.slides : null,
          metadata: parsed,
          status: 'READY',
        },
      });

      created++;
      await agentLog('Content Replicator', `${format} criado para "${post.topic}" (${targetPlatform})`, {
        type: 'result',
        payload: { format, platform: targetPlatform, postId },
      });
    } catch (err: any) {
      errors++;
      await agentLog('Content Replicator', `Erro ao criar ${format}: ${err.message}`, { type: 'error' });
    }
  }

  await agentLog('Content Replicator', `Replicação concluída: ${created} formatos criados, ${errors} erros`, {
    type: 'info',
    payload: { postId, created, errors, formats },
  });

  return { created, errors };
}

// Replicate a post into ALL formats at once
export async function replicateAll(postId: string): Promise<{ created: number; errors: number }> {
  const allFormats: ReplicaFormat[] = ['carousel', 'story', 'video_script', 'email', 'thread', 'ad_copy'];
  return replicateContent(postId, allFormats);
}

// Get all replicas for a post
export async function getReplicasForPost(postId: string) {
  return prisma.contentReplica.findMany({
    where: { originalPostId: postId },
    orderBy: { createdAt: 'desc' },
  });
}

// Get replica stats
export async function getReplicaStats() {
  const total = await prisma.contentReplica.count();
  const byFormat = await prisma.contentReplica.groupBy({
    by: ['format'],
    _count: { id: true },
  });
  const byPlatform = await prisma.contentReplica.groupBy({
    by: ['platform'],
    _count: { id: true },
  });
  const recent = await prisma.contentReplica.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return {
    total,
    byFormat: byFormat.map((b) => ({ format: b.format, count: b._count.id })),
    byPlatform: byPlatform.map((b) => ({ platform: b.platform, count: b._count.id })),
    recent,
  };
}

function getPlatformForFormat(format: ReplicaFormat): string {
  switch (format) {
    case 'carousel': return 'instagram';
    case 'story': return 'instagram';
    case 'video_script': return 'tiktok';
    case 'email': return 'email';
    case 'thread': return 'facebook';
    case 'ad_copy': return 'facebook';
    default: return 'facebook';
  }
}
