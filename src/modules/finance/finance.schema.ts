import { z } from 'zod';

export const createBudgetSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  clientId: z.string().min(1, 'Client ID is required'),
  campaignId: z.string().optional().nullable(),
  items: z.array(z.object({
    description: z.string(),
    amount: z.number().min(0),
  })).optional(),
  total: z.number().min(0).optional(),
  status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED']).optional(),
});

export const updateBudgetSchema = createBudgetSchema.partial();

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  budgetId: z.string().optional().nullable(),
  amount: z.number().min(0, 'Amount must be positive'),
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  dueDate: z.string().optional().nullable(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();
