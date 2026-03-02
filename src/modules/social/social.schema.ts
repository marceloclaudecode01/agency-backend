import { z } from 'zod';

export const publishPostSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  imageUrl: z.string().url().optional().nullable(),
  mediaUrl: z.string().url().optional().nullable(),
  mediaType: z.enum(['image', 'video']).optional().nullable(),
  linkUrl: z.string().url().optional().nullable(),
  scheduledTime: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
}).refine((data) => {
  if (!data.scheduledTime) return true;
  const scheduled = new Date(data.scheduledTime);
  const now = new Date();
  const minTime = new Date(now.getTime() + 10 * 60 * 1000);
  const maxTime = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);
  return scheduled >= minTime && scheduled <= maxTime;
}, {
  message: 'Scheduled time must be between 10 minutes and 75 days from now',
  path: ['scheduledTime'],
});
