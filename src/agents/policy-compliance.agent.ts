import prisma from '../config/database';
import { askGemini } from './gemini';
import { agentLog } from './agent-logger';

/**
 * Policy Compliance Agent
 * - Checks content against platform policies (Meta, TikTok, etc.)
 * - Flags potential violations before publishing
 * - Hooked into Content Governor (inline, no separate cron)
 */

const FORBIDDEN_PATTERNS = [
  /antes e depois/i,
  /resultado garantido/i,
  /cure|cura definitiva/i,
  /ganhe dinheiro fácil/i,
  /renda extra garantida/i,
  /emagreça \d+ kg/i,
  /sem esforço/i,
];

export async function checkCompliance(message: string, platform = 'facebook'): Promise<{
  compliant: boolean;
  issues: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestions: string[];
}> {
  const issues: string[] = [];

  // Rule-based checks first (fast)
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(message)) {
      issues.push(`Pattern violation: "${message.match(pattern)?.[0]}"`);
    }
  }

  // Length checks
  if (platform === 'facebook' && message.length > 63206) {
    issues.push('Exceeds Facebook character limit');
  }

  // Hashtag spam check
  const hashtagCount = (message.match(/#/g) || []).length;
  if (hashtagCount > 30) {
    issues.push(`Too many hashtags (${hashtagCount}), risk of shadowban`);
  }

  // If rule-based found issues, skip LLM
  if (issues.length > 0) {
    return {
      compliant: false,
      issues,
      riskLevel: issues.length >= 3 ? 'HIGH' : 'MEDIUM',
      suggestions: ['Revise content to remove flagged patterns'],
    };
  }

  // LLM-based deep check for edge cases
  try {
    const prompt = `Analise se este post viola políticas de ${platform}. Considere: discurso de ódio, desinformação saúde, promessas financeiras, conteúdo adulto, spam.

Post: "${message.substring(0, 500)}"

Responda APENAS JSON:
{"compliant": true, "issues": [], "riskLevel": "LOW", "suggestions": []}`;

    const raw = await askGemini(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}

  return { compliant: true, issues: [], riskLevel: 'LOW', suggestions: [] };
}

export async function getComplianceStats() {
  // Count recent rejections by governor with compliance reasons
  const recentRejected = await prisma.scheduledPost.count({
    where: {
      governorDecision: 'REJECT',
      governorReason: { contains: 'compliance' },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const totalReviewed = await prisma.scheduledPost.count({
    where: {
      governorReviewedAt: { not: null },
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  return {
    totalReviewed,
    rejected: recentRejected,
    complianceRate: totalReviewed > 0 ? Math.round(((totalReviewed - recentRejected) / totalReviewed) * 100) : 100,
  };
}
