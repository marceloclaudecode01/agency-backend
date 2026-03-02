import prisma from '../config/database';

const DEFAULT_BRAND: Record<string, string> = {
  tom_de_voz: 'Inteligente, direto, provocativo e humano. Alterna entre educativo, inspirador e descontraído. Linguagem informal brasileira.',
  persona: 'Somos uma página de conteúdo de alto valor — dicas práticas, insights poderosos, tendências e conhecimento que transforma. Autoridade com proximidade.',
  valores: 'Valor real, crescimento pessoal, conhecimento prático, comunidade engajada, autenticidade.',
  posicionamento: 'Referência em conteúdo útil, surpreendente e compartilhável. Cada post entrega algo que vale salvar.',
  palavras_proibidas: 'pirata, ilegal, crack, torrent, hack, clickbait vazio, spam',
  emojis_preferidos: '🔥 💡 🚀 ✨ 📌 💪 🧠 📊 🎯',
  nicho_proibido: 'NÃO produzir conteúdo sobre streamers, filmes, séries, entretenimento genérico ou TV online.',
  estrategia_conteudo: 'Distribuição: 40% educativo, 30% engajamento/interação, 20% autoridade/prova social, 10% pessoal/bastidores.',
};

export async function getBrandContext(): Promise<string> {
  try {
    const configs = await prisma.brandConfig.findMany();
    const brand: Record<string, string> = { ...DEFAULT_BRAND };

    for (const c of configs) {
      brand[c.key] = c.value;
    }

    return `
BRAND GUIDELINES:
- Tom de voz: ${brand.tom_de_voz}
- Persona: ${brand.persona}
- Valores: ${brand.valores}
- Posicionamento: ${brand.posicionamento}
- Palavras proibidas: ${brand.palavras_proibidas}
- Emojis preferidos: ${brand.emojis_preferidos}
- RESTRIÇÃO DE NICHO: ${brand.nicho_proibido || ''}
- Estratégia de conteúdo: ${brand.estrategia_conteudo || ''}
IMPORTANTE: Sempre siga estas guidelines. NUNCA produza conteúdo sobre filmes, séries, streaming ou entretenimento genérico.`;
  } catch {
    return '';
  }
}

export async function seedBrandConfig(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_BRAND)) {
    await prisma.brandConfig.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
}

export async function updateBrandConfig(key: string, value: string): Promise<void> {
  await prisma.brandConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getAllBrandConfig(): Promise<Record<string, string>> {
  const configs = await prisma.brandConfig.findMany();
  const result: Record<string, string> = { ...DEFAULT_BRAND };
  for (const c of configs) {
    result[c.key] = c.value;
  }
  return result;
}
