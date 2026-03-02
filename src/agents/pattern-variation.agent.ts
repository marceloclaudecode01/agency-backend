import prisma from '../config/database';
import { askGemini } from './gemini';
import { agentLog } from './agent-logger';

/**
 * Pattern Variation Agent
 * - Ensures content doesn't become repetitive/predictable
 * - Varies sentence structure, hooks, CTAs, emoji patterns
 * - Hooked into Content Governor (inline, no separate cron)
 */

export async function checkPatternVariation(message: string): Promise<{
  varied: boolean;
  similarityScore: number;
  suggestions: string[];
}> {
  // Get recent published posts for comparison
  const recentPosts = await prisma.scheduledPost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 15,
    select: { message: true, topic: true },
  });

  if (recentPosts.length < 3) {
    return { varied: true, similarityScore: 0, suggestions: [] };
  }

  // Quick structural checks
  const newFirstLine = message.split('\n')[0] || '';
  const recentFirstLines = recentPosts.map((p) => p.message.split('\n')[0] || '');

  // Check if opening line is too similar
  let similarOpenings = 0;
  for (const line of recentFirstLines) {
    if (levenshteinSimilarity(newFirstLine, line) > 0.6) similarOpenings++;
  }

  const openingSimilarity = similarOpenings / recentFirstLines.length;

  // Check emoji pattern repetition
  const newEmojis = (message.match(/[\u{1F000}-\u{1FFFF}]/gu) || []).join('');
  const recentEmojis = recentPosts.map((p) => (p.message.match(/[\u{1F000}-\u{1FFFF}]/gu) || []).join(''));
  const emojiRepeat = recentEmojis.filter((e) => e === newEmojis).length;

  const similarityScore = Math.round((openingSimilarity * 0.6 + (emojiRepeat / Math.max(1, recentPosts.length)) * 0.4) * 100);

  if (similarityScore < 40) {
    return { varied: true, similarityScore, suggestions: [] };
  }

  // Use LLM to suggest variations
  try {
    const prompt = `Este post é muito similar aos recentes. Sugira 2 variações no tom/estrutura.

Post: "${message.substring(0, 300)}"

Recentes (primeiras linhas): ${recentFirstLines.slice(0, 5).join(' | ')}

Responda APENAS JSON: {"suggestions": ["sugestão 1", "sugestão 2"]}`;

    const raw = await askGemini(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const data = match ? JSON.parse(match[0]) : { suggestions: [] };

    return { varied: false, similarityScore, suggestions: data.suggestions || [] };
  } catch {
    return { varied: false, similarityScore, suggestions: ['Vary the opening hook', 'Change emoji patterns'] };
  }
}

export async function getVariationStats() {
  const recent = await prisma.scheduledPost.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 30,
    select: { message: true, contentType: true },
  });

  const types = recent.map((p) => p.contentType).filter(Boolean);
  const typeCounts: Record<string, number> = {};
  for (const t of types) {
    typeCounts[t!] = (typeCounts[t!] || 0) + 1;
  }

  return {
    totalRecent: recent.length,
    contentTypeMix: typeCounts,
    diversityScore: Object.keys(typeCounts).length > 0
      ? Math.round((Object.keys(typeCounts).length / Math.max(1, recent.length)) * 100)
      : 0,
  };
}

// Simple Levenshtein similarity (0-1)
function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  a = a.toLowerCase().substring(0, 100);
  b = b.toLowerCase().substring(0, 100);
  if (a === b) return 1;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = i === 0 ? j : 0;
    }
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return 1 - matrix[a.length][b.length] / maxLen;
}
