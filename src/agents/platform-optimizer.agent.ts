import { askGemini } from './gemini';
import { getBrandContext } from './brand-brain.agent';
import { agentLog } from './agent-logger';

/**
 * Platform Optimizer Agent
 * Adapts content for each platform's best practices:
 * - Facebook: longer posts, engagement questions, shares
 * - Instagram: visual-first, hashtags, Reels hooks
 * - TikTok: ultra-short hooks, trending sounds, fast pace
 * - YouTube: SEO titles, descriptions, thumbnails
 */

export interface PlatformVersion {
  platform: string;
  message: string;
  hashtags: string[];
  hook: string;
  cta: string;
  formatTips: string;
  characterCount: number;
}

const PLATFORM_RULES: Record<string, string> = {
  facebook: `FACEBOOK:
- Texto pode ser mais longo (até 500 chars)
- Perguntas abertas geram comentários
- "Marca alguém" e "Compartilha" funcionam bem
- Horários: 9h, 13h, 16h
- Emojis moderados (3-5)
- Quebras de linha para legibilidade`,

  instagram: `INSTAGRAM:
- Primeira linha é CRUCIAL (aparece no feed truncada)
- Máximo 2200 chars mas ideal < 300
- Hashtags: 5-10 relevantes (mistura popular + nicho)
- CTA: "Salva pra depois", "Manda pra quem precisa"
- Emojis são essenciais
- Formato visual: pense em como fica com a foto`,

  tiktok: `TIKTOK:
- Hook em 3 SEGUNDOS ou menos (texto na tela)
- Ultra curto e direto
- Linguagem jovem e casual
- Trends e referências atuais
- CTA: "Comenta", "Dueta", "Segue pra mais"
- Máximo 150 chars de legenda
- Hashtags: 3-5 trending`,

  youtube: `YOUTUBE:
- Título SEO otimizado (máx 60 chars, keyword no início)
- Descrição: primeiras 2 linhas são preview
- Tags relevantes para descoberta
- CTA: "Se inscreve", "Ativa o sininho", "Comenta"
- Thumbnail text suggestion (3-5 palavras impactantes)`,
};

export async function optimizeForPlatform(
  originalMessage: string,
  topic: string,
  targetPlatform: string
): Promise<PlatformVersion> {
  const rules = PLATFORM_RULES[targetPlatform] || PLATFORM_RULES.facebook;

  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  const prompt = `Você é um especialista em otimização de conteúdo por plataforma.
${brandCtx}

POST ORIGINAL (Facebook):
"${originalMessage.substring(0, 500)}"

TEMA: ${topic}

ADAPTE para: ${targetPlatform.toUpperCase()}

REGRAS DA PLATAFORMA:
${rules}

INSTRUÇÕES:
1. Reescreva o post otimizado para ${targetPlatform}
2. Adapte tom, tamanho, formato e CTA
3. NÃO copie igual — transforme para a linguagem da plataforma
4. Mantenha a essência e valor do conteúdo

Retorne APENAS JSON:
{
  "message": "texto otimizado para ${targetPlatform}",
  "hashtags": ["tag1", "tag2", "tag3"],
  "hook": "primeira frase que prende atenção",
  "cta": "chamada para ação específica da plataforma",
  "formatTips": "dica de formato visual (ex: usar carrossel, vídeo, etc)"
}`;

  try {
    const raw = await askGemini(prompt);
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('Resposta inválida');

    const parsed = JSON.parse(match[0]);

    await agentLog('Platform Optimizer', `Post otimizado para ${targetPlatform}: "${topic}"`, {
      type: 'result',
      payload: { platform: targetPlatform, hookLength: parsed.hook?.length },
    });

    return {
      platform: targetPlatform,
      message: parsed.message || originalMessage,
      hashtags: parsed.hashtags || [],
      hook: parsed.hook || '',
      cta: parsed.cta || '',
      formatTips: parsed.formatTips || '',
      characterCount: (parsed.message || '').length,
    };
  } catch (err: any) {
    await agentLog('Platform Optimizer', `Erro ao otimizar para ${targetPlatform}: ${err.message}`, { type: 'error' });
    return {
      platform: targetPlatform,
      message: originalMessage,
      hashtags: [],
      hook: '',
      cta: '',
      formatTips: '',
      characterCount: originalMessage.length,
    };
  }
}

// Optimize for ALL platforms at once
export async function optimizeForAllPlatforms(
  originalMessage: string,
  topic: string
): Promise<PlatformVersion[]> {
  const platforms = ['facebook', 'instagram', 'tiktok', 'youtube'];
  const results: PlatformVersion[] = [];

  for (const platform of platforms) {
    const version = await optimizeForPlatform(originalMessage, topic, platform);
    results.push(version);
  }

  await agentLog('Platform Optimizer', `${results.length} versões criadas para "${topic}"`, {
    type: 'info',
    payload: { platforms, topic },
  });

  return results;
}
