import { GoogleGenerativeAI } from '@google/generative-ai';

// Suporta múltiplas keys para rotação (GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3)
const RAW_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean) as string[];

if (RAW_KEYS.length === 0) {
  console.warn('[Gemini] Nenhuma GEMINI_API_KEY configurada!');
}

// Controle de rotação e cooldown por key
const keyState = RAW_KEYS.map((key) => ({
  key,
  client: new GoogleGenerativeAI(key),
  blockedUntil: 0, // timestamp em ms
}));

let currentKeyIndex = 0;

function getNextAvailableKey() {
  const now = Date.now();
  // Tenta a partir do índice atual, dando volta se necessário
  for (let i = 0; i < keyState.length; i++) {
    const idx = (currentKeyIndex + i) % keyState.length;
    if (keyState[idx].blockedUntil <= now) {
      currentKeyIndex = (idx + 1) % keyState.length; // próxima chamada começa da seguinte
      return keyState[idx];
    }
  }
  // Todas bloqueadas: retorna a que desbloqueia mais cedo
  const soonest = keyState.reduce((a, b) => (a.blockedUntil < b.blockedUntil ? a : b));
  const waitMs = soonest.blockedUntil - now;
  console.log(`[Gemini] Todas as keys em cooldown. Aguardando ${Math.ceil(waitMs / 1000)}s...`);
  return null; // chamador vai esperar
}

export async function askGemini(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const state = getNextAvailableKey();

    if (!state) {
      // Todas bloqueadas: espera a mais rápida liberar
      const now = Date.now();
      const soonest = keyState.reduce((a, b) => (a.blockedUntil < b.blockedUntil ? a : b));
      const waitMs = Math.max(soonest.blockedUntil - now, 0) + 500;
      await new Promise((r) => setTimeout(r, waitMs));
      attempt--; // não conta como tentativa
      continue;
    }

    try {
      const model = state.client.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.toLowerCase().includes('quota');
      if (is429) {
        // Bloqueia esta key por 60 segundos
        state.blockedUntil = Date.now() + 60_000;
        console.log(`[Gemini] Key bloqueada por 60s. Trocando para próxima key...`);
        if (attempt < retries - 1) continue;
      }
      throw err;
    }
  }
  throw new Error('Gemini indisponível após todas as tentativas');
}
