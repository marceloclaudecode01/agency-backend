import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional().nullable(),
  clientId: z.string().min(1, 'Client ID is required'),
  status: z.enum(['PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  budget: z.number().min(0).optional().nullable(),
  goals: z.string().optional().nullable(),
});

export const updateCampaignSchema = createCampaignSchema.partial();
