import { askGemini } from './gemini';
import { getBrandContext } from './brand-brain.agent';
import { agentLog } from './agent-logger';

/**
 * Carousel Generator Agent
 * Creates educational carousel slides with structured content.
 * Each slide has title, body, visual suggestion, and design notes.
 */

export interface CarouselSlide {
  slideNumber: number;
  title: string;
  body: string;
  emoji: string;
  designNote: string;
  backgroundColor: string;
}

export interface CarouselResult {
  topic: string;
  slides: CarouselSlide[];
  caption: string;
  hashtags: string[];
  totalSlides: number;
}

const CAROUSEL_STYLES = [
  'EDUCATIVO_LISTA',     // "5 dicas para..." — cada slide = 1 dica
  'PASSO_A_PASSO',       // Tutorial sequencial
  'MITOS_VS_VERDADES',   // Slide com mito, slide com verdade
  'ANTES_DEPOIS',        // Comparação transformacional
  'PERGUNTA_RESPOSTA',   // FAQ visual
  'STORYTELLING',        // Mini-história em slides
];

export async function generateCarousel(
  topic: string,
  style?: string,
  slideCount?: number
): Promise<CarouselResult> {
  let brandCtx = '';
  try { brandCtx = await getBrandContext(); } catch {}

  const selectedStyle = style || CAROUSEL_STYLES[Math.floor(Math.random() * CAROUSEL_STYLES.length)];
  const numSlides = slideCount || 6;

  const prompt = `Você é um designer de conteúdo especialista em CARROSSÉIS virais para Instagram/Facebook.
${brandCtx}

TEMA: "${topic}"
ESTILO: ${selectedStyle}
NÚMERO DE SLIDES: ${numSlides}

REGRAS DO CARROSSEL:
1. Slide 1 = CAPA — título impactante que faz a pessoa deslizar
2. Slides 2-${numSlides - 1} = CONTEÚDO — informação valiosa e concisa
3. Slide ${numSlides} = CTA — chamada para ação (salvar, seguir, compartilhar)
4. Cada slide: título (máx 6 palavras), corpo (máx 30 palavras)
5. Use emojis estratégicos (1 por slide)
6. Sugira cores de fundo que combinem (hex)
7. Português do Brasil

Retorne APENAS JSON:
{
  "slides": [
    {
      "slideNumber": 1,
      "title": "Título da capa",
      "body": "Subtítulo ou gancho",
      "emoji": "🔥",
      "designNote": "Texto grande centralizado, fundo escuro",
      "backgroundColor": "#1a1a2e"
    }
  ],
  "caption": "Legenda para o post (máx 200 chars, com CTA)",
  "hashtags": ["carrossel", "dicas", "conhecimento"]
}`;

  try {
    const raw = await askGemini(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta inválida do Gemini');

    const parsed = JSON.parse(match[0]);

    // Validate slides
    if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length < 3) {
      throw new Error('Carrossel com menos de 3 slides');
    }

    // Normalize slide numbers
    parsed.slides = parsed.slides.map((s: any, i: number) => ({
      slideNumber: i + 1,
      title: s.title || `Slide ${i + 1}`,
      body: s.body || '',
      emoji: s.emoji || '📌',
      designNote: s.designNote || '',
      backgroundColor: s.backgroundColor || '#1a1a2e',
    }));

    await agentLog('Carousel Generator', `Carrossel "${topic}" criado: ${parsed.slides.length} slides, estilo ${selectedStyle}`, {
      type: 'result',
      payload: { topic, style: selectedStyle, slides: parsed.slides.length },
    });

    return {
      topic,
      slides: parsed.slides,
      caption: parsed.caption || '',
      hashtags: parsed.hashtags || [],
      totalSlides: parsed.slides.length,
    };
  } catch (err: any) {
    await agentLog('Carousel Generator', `Erro ao gerar carrossel: ${err.message}`, { type: 'error' });
    throw err;
  }
}

// Get available carousel styles
export function getCarouselStyles(): string[] {
  return [...CAROUSEL_STYLES];
}
