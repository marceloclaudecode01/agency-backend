import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function askGemini(prompt: string, retries = 3): Promise<string> {
  const backoffs = [15000, 30000, 60000];
  for (let i = 0; i < retries; i++) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.toLowerCase().includes('quota');
      if (is429 && i < retries - 1) {
        const wait = backoffs[i];
        console.log(`[Gemini] Cota atingida. Aguardando ${wait / 1000}s antes de tentar novamente (${i + 1}/${retries - 1})...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Gemini indisponível após 3 tentativas');
}
