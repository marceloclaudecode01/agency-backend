import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  console.warn('[Groq] GROQ_API_KEY não configurada!');
}

const client = new Groq({ apiKey });

export async function askGroq(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      });
      return completion.choices[0]?.message?.content || '';
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.toLowerCase().includes('rate');
      if (is429 && attempt < retries - 1) {
        console.log(`[Groq] Rate limit atingido. Aguardando 10s antes de tentar novamente...`);
        await new Promise((r) => setTimeout(r, 10_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Groq indisponível após todas as tentativas');
}
