import { askGemini } from './gemini';
import { getBrandContext } from './brand-brain.agent';
import { agentLog } from './agent-logger';

/**
 * Viral Mechanics Lab
 * Enhances content with viral triggers before publication.
 * Modules: Hook Generator, Emotional Amplifier, Curiosity Engine,
 *          Pattern Interrupt, Share Trigger Builder
 */

export interface ViralEnhancement {
  enhancedMessage: string;
  viralScore: number; // 1-10
  appliedTechniques: string[];
  hookType: string;
  emotionalTrigger: string;
}

const VIRAL_TECHNIQUES = {
  hooks: [
    'PERGUNTA_CHOCANTE',    // "Você sabia que 90% das pessoas..."
    'NUMERO_IMPACTANTE',     // "7 coisas que ninguém te conta sobre..."
    'CONTRARIAN',            // "Tudo que te ensinaram sobre X está errado"
    'HISTORIA_PESSOAL',      // "Eu perdi tudo quando..."
    'URGENCIA',              // "Antes que seja tarde demais..."
    'SEGREDO_REVELADO',      // "O que ninguém fala sobre..."
    'DESAFIO',               // "Aposto que você não consegue..."
  ],
  emotionalTriggers: [
    'CURIOSIDADE',
    'MEDO_DE_PERDER',
    'ORGULHO',
    'SURPRESA',
    'IDENTIFICACAO',
    'ASPIRACAO',
    'INDIGNACAO',
  ],
  shareMotivators: [
    'MARCA_ALGUEM',          // "Marca aquele amigo que..."
    'SALVA_PRA_DEPOIS',      // "Salva esse post, você vai precisar"
    'COMPARTILHA_SE_CONCORDA', // "Compartilha se você também..."
    'TAG_NOS_STORIES',       // "Posta nos stories e me marca"
    'DESAFIO_VIRAL',         // "Faz isso e posta o resultado"
  ],
  patternInterrupts: [
    'QUEBRA_LINHA_DRAMATICA', // Usar ... ou — para criar pausas
    'EMOJI_ESTRATEGICO',      // Emoji no início para chamar atenção
    'CAPS_SELETIVO',          // UMA palavra em caps para ênfase
    'FORMATO_INESPERADO',     // Começar com o final da história
  ],
};

export async function enhanceWithViralMechanics(
  originalMessage: string,
  topic: string,
  contentCategory: string
): Promise<ViralEnhancement> {
  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  const prompt = `Você é um ESPECIALISTA em conteúdo viral para redes sociais brasileiras.

${brandCtx}

Sua missão: Transformar este post em uma versão com MÁXIMO potencial viral.

POST ORIGINAL:
"${originalMessage.substring(0, 500)}"

TEMA: ${topic}
CATEGORIA: ${contentCategory}

TÉCNICAS DISPONÍVEIS (aplique as que fizerem sentido):

HOOKS (escolha 1):
${VIRAL_TECHNIQUES.hooks.map(h => `- ${h}`).join('\n')}

GATILHOS EMOCIONAIS (escolha 1-2):
${VIRAL_TECHNIQUES.emotionalTriggers.map(e => `- ${e}`).join('\n')}

MOTIVADORES DE COMPARTILHAMENTO (escolha 1-2):
${VIRAL_TECHNIQUES.shareMotivators.map(s => `- ${s}`).join('\n')}

PATTERN INTERRUPTS (escolha 1):
${VIRAL_TECHNIQUES.patternInterrupts.map(p => `- ${p}`).join('\n')}

REGRAS:
1. Mantenha a ESSÊNCIA e informação do post original
2. Melhore o hook (primeiras 2 linhas são CRUCIAIS)
3. Adicione gatilhos emocionais naturalmente
4. Termine com CTA forte que gere interação
5. Use quebras de linha estratégicas
6. Máximo 600 caracteres
7. PORTUGUÊS do Brasil, tom inteligente e humano
8. NÃO pareça spam ou clickbait barato

Retorne APENAS JSON:
{
  "enhancedMessage": "texto melhorado aqui",
  "viralScore": 8,
  "appliedTechniques": ["HOOK_TIPO", "GATILHO_TIPO", "SHARE_TIPO"],
  "hookType": "PERGUNTA_CHOCANTE",
  "emotionalTrigger": "CURIOSIDADE"
}`;

  try {
    const raw = await askGemini(prompt);
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error('Invalid viral enhancement response');

    const result = JSON.parse(match[0]);

    // Validate viralScore
    result.viralScore = Math.max(1, Math.min(10, result.viralScore || 5));

    await agentLog('Viral Mechanics', `Post "${topic}" enhanced: score ${result.viralScore}/10, techniques: ${result.appliedTechniques?.join(', ') || 'N/A'}`, {
      type: 'result',
      payload: { viralScore: result.viralScore, hookType: result.hookType },
    });

    return result;
  } catch (err: any) {
    await agentLog('Viral Mechanics', `Enhancement failed for "${topic}": ${err.message}`, { type: 'error' });
    // Return original with default score
    return {
      enhancedMessage: originalMessage,
      viralScore: 5,
      appliedTechniques: [],
      hookType: 'NONE',
      emotionalTrigger: 'NONE',
    };
  }
}

// Quick viral score check without enhancement (for Governor quality gate)
export async function getViralScore(message: string): Promise<number> {
  try {
    const prompt = `Avalie o potencial viral deste post de 1 a 10.
Critérios: hook forte, gatilho emocional, CTA claro, compartilhável, formato.
Post: "${message.substring(0, 400)}"
Retorne APENAS o número (1-10).`;

    const raw = await askGemini(prompt);
    const score = parseInt(raw.trim());
    return isNaN(score) ? 5 : Math.max(1, Math.min(10, score));
  } catch {
    return 5;
  }
}
