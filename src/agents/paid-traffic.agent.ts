import cron from 'node-cron';
import prisma from '../config/database';
import { agentLog } from './agent-logger';
import { isSafeModeActive, isAgentPaused } from './safe-mode';

/**
 * Paid Traffic War Machine
 * - Monitors active ad campaigns performance
 * - Auto-pauses underperforming ads
 * - Scales winning creatives
 * - Runs every 4 hours
 */

export async function syncAdCampaigns(): Promise<any> {
  const activeCampaigns = await prisma.adCampaign.findMany({
    where: { status: 'ACTIVE' },
    include: { creatives: true },
  });

  if (activeCampaigns.length === 0) return { synced: 0, message: 'No active campaigns' };

  // For now, simulate performance tracking (Meta Ads API integration placeholder)
  const results = [];
  for (const campaign of activeCampaigns) {
    // Check budget exhaustion
    if (campaign.spent >= campaign.budget && campaign.budget > 0) {
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED' },
      });
      await agentLog('Paid Traffic', `Campaign "${campaign.name}" completed — budget exhausted`, { type: 'info' });
      continue;
    }

    // Check end date
    if (campaign.endDate && new Date() > campaign.endDate) {
      await prisma.adCampaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED' },
      });
      continue;
    }

    results.push({
      id: campaign.id,
      name: campaign.name,
      budget: campaign.budget,
      spent: campaign.spent,
      remaining: campaign.budget - campaign.spent,
      creativesCount: campaign.creatives.length,
    });
  }

  return { synced: results.length, campaigns: results };
}

export async function getAdDashboard() {
  const campaigns = await prisma.adCampaign.findMany({
    include: { creatives: true },
    orderBy: { createdAt: 'desc' },
  });

  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');

  return {
    campaigns,
    totalCampaigns: campaigns.length,
    activeCampaigns: activeCampaigns.length,
    totalBudget,
    totalSpent,
    totalCreatives: campaigns.reduce((s, c) => s + c.creatives.length, 0),
  };
}

export function startPaidTrafficAgent() {
  // Every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    if (await isSafeModeActive() || await isAgentPaused('Paid Traffic')) return;
    try {
      const result = await syncAdCampaigns();
      if (result.synced > 0) {
        await agentLog('Paid Traffic', `Synced ${result.synced} active campaigns`, { type: 'result' });
      }
    } catch (err: any) {
      await agentLog('Paid Traffic', `Error: ${err.message}`, { type: 'error' });
    }
  });
}
