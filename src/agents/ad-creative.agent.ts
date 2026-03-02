import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { askGemini } from './gemini';

/**
 * Ad Creative Agent
 * - Generates ad copy and creative variations
 * - Optimizes headlines, body, CTAs for paid campaigns
 */

export async function generateAdCreative(campaignId: string, count = 3): Promise<any[]> {
  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  // Get audience insights for targeting
  const insights = await prisma.audienceInsight.findMany({
    orderBy: { confidence: 'desc' },
    take: 5,
  });

  const audienceContext = insights.map((i) => i.insight).join('; ');

  const prompt = `Você é um especialista em anúncios pagos (Meta Ads).

Campanha: ${campaign.name}
Objetivo: ${campaign.objective}
Plataforma: ${campaign.platform}
Audiência: ${audienceContext || 'Público geral interessado no nicho'}

Gere ${count} variações de criativos para testes A/B.

Retorne APENAS JSON válido:
{
  "creatives": [
    {
      "type": "image",
      "headline": "headline poderoso (max 40 chars)",
      "body": "texto do anúncio (max 125 chars)",
      "ctaText": "CTA button text"
    }
  ]
}`;

  const raw = await askGemini(prompt);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to parse ad creatives');

  const data = JSON.parse(match[0]);
  const saved = [];

  for (const creative of (data.creatives || []).slice(0, count)) {
    const record = await prisma.adCreative.create({
      data: {
        campaignId,
        type: creative.type || 'image',
        headline: creative.headline,
        body: creative.body,
        ctaText: creative.ctaText || 'Saiba Mais',
        status: 'DRAFT',
      },
    });
    saved.push(record);
  }

  await agentLog('Ad Creative', `${saved.length} creatives generated for campaign "${campaign.name}"`, { type: 'result' });
  return saved;
}

export async function getCreativesForCampaign(campaignId: string) {
  return prisma.adCreative.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
  });
}
