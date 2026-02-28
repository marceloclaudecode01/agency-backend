import Groq from 'groq-sdk';

let client: Groq | null = null;

const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

function getClient(): Groq {
  if (!client) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('[Groq] GROQ_API_KEY não configurada!');
    }
    client = new Groq({ apiKey });
  }
  return client;
}

export async function askGemini(prompt: string, retries = 3): Promise<string> {
  for (const model of MODELS) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const completion = await getClient().chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 2048,
        });
        return completion.choices[0]?.message?.content || '';
      } catch (err: any) {
        const is429 = err?.message?.includes('429') || err?.message?.toLowerCase().includes('rate');
        if (is429 && attempt < retries - 1) {
          console.log(`[Groq] Rate limit (${model}). Aguardando 10s...`);
          await new Promise((r) => setTimeout(r, 10_000));
          continue;
        }
        if (attempt === retries - 1) {
          console.warn(`[Groq] Modelo ${model} falhou após ${retries} tentativas. Tentando fallback...`);
          break;
        }
      }
    }
  }
  throw new Error('Groq indisponível: todos os modelos falharam');
}
