import { z } from 'zod';

export const publishPostSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  imageUrl: z.string().url().optional().nullable(),
  scheduledTime: z.string().optional().nullable(),
});
