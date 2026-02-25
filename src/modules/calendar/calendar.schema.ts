import { z } from 'zod';

export const createEventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional().nullable(),
  type: z.enum(['MEETING', 'DEADLINE', 'DELIVERY', 'OTHER']).default('OTHER'),
  date: z.string().min(1, 'Date is required'),
  endDate: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
});

export const updateEventSchema = createEventSchema.partial();
