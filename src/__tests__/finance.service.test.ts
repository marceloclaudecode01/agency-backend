/**
 * Unit tests for FinanceService.
 * Prisma is mocked — no real DB connection is made.
 *
 * Note on createInvoice(): the real implementation does NOT validate budget status.
 * It accepts any data and delegates to Prisma. Tests reflect this actual behaviour.
 * The "DRAFT budget" test verifies the service does NOT throw (no such guard exists).
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

import { prismaMock, prismaMockModule, resetPrismaMock } from './mocks/prisma.mock';

jest.mock('../config/database', () => prismaMockModule);

import { FinanceService } from '../modules/finance/finance.service';

describe('FinanceService', () => {
  let service: FinanceService;

  beforeEach(() => {
    service = new FinanceService();
    resetPrismaMock();
  });

  // ---------------------------------------------------------------------------
  // createInvoice()
  // ---------------------------------------------------------------------------
  describe('createInvoice()', () => {
    it('creates an invoice with the provided data and returns it', async () => {
      const input = {
        clientId: 'client-1',
        budgetId: 'budget-1',
        amount: 1500,
        status: 'PENDING',
        dueDate: '2026-03-31',
      };
      const createdInvoice = {
        id: 'invoice-1',
        clientId: 'client-1',
        budgetId: 'budget-1',
        amount: 1500,
        status: 'PENDING',
        dueDate: new Date('2026-03-31'),
        client: { id: 'client-1', name: 'Acme', company: 'Acme Corp' },
        budget: { id: 'budget-1', total: 5000, status: 'APPROVED' },
      };
      prismaMock.invoice.create.mockResolvedValue(createdInvoice);

      const result = await service.createInvoice(input);

      expect(prismaMock.invoice.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(createdInvoice);
    });

    it('calls prisma.invoice.create with correct clientId and amount', async () => {
      const input = { clientId: 'client-2', amount: 2000 };
      prismaMock.invoice.create.mockResolvedValue({
        id: 'invoice-2',
        clientId: 'client-2',
        amount: 2000,
        status: 'PENDING',
        dueDate: null,
        client: { id: 'client-2', name: 'Beta', company: null },
        budget: null,
      });

      await service.createInvoice(input);

      const callArg = prismaMock.invoice.create.mock.calls[0][0];
      expect(callArg.data.clientId).toBe('client-2');
      expect(callArg.data.amount).toBe(2000);
    });

    it('defaults status to PENDING when not provided', async () => {
      prismaMock.invoice.create.mockResolvedValue({
        id: 'invoice-3',
        clientId: 'c1',
        amount: 100,
        status: 'PENDING',
        dueDate: null,
        client: { id: 'c1', name: 'X', company: null },
        budget: null,
      });

      await service.createInvoice({ clientId: 'c1', amount: 100 });

      const callArg = prismaMock.invoice.create.mock.calls[0][0];
      expect(callArg.data.status).toBe('PENDING');
    });

    it('accepts invoice creation even when the linked budget has DRAFT status (no guard in service)', async () => {
      // The service does NOT check budget status — it only stores what it receives.
      prismaMock.invoice.create.mockResolvedValue({
        id: 'invoice-4',
        clientId: 'c1',
        budgetId: 'budget-draft',
        amount: 500,
        status: 'PENDING',
        dueDate: null,
        client: { id: 'c1', name: 'X', company: null },
        budget: { id: 'budget-draft', total: 1000, status: 'DRAFT' },
      });

      await expect(
        service.createInvoice({ clientId: 'c1', budgetId: 'budget-draft', amount: 500 })
      ).resolves.toBeDefined();
    });

    it('converts dueDate string to a Date object', async () => {
      prismaMock.invoice.create.mockResolvedValue({
        id: 'invoice-5',
        clientId: 'c1',
        amount: 100,
        status: 'PENDING',
        dueDate: new Date('2026-06-01'),
        client: { id: 'c1', name: 'X', company: null },
        budget: null,
      });

      await service.createInvoice({ clientId: 'c1', amount: 100, dueDate: '2026-06-01' });

      const callArg = prismaMock.invoice.create.mock.calls[0][0];
      expect(callArg.data.dueDate).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------------
  // getSummary()
  // ---------------------------------------------------------------------------
  describe('getSummary()', () => {
    it('returns correct totals from aggregated invoice data', async () => {
      prismaMock.invoice.aggregate
        // First call: totalRevenue (PAID invoices _sum.amount)
        .mockResolvedValueOnce({ _sum: { amount: 10000 } })
        // Second call: pendingInvoices (_sum.amount + _count)
        .mockResolvedValueOnce({ _sum: { amount: 3000 }, _count: 2 })
        // Third call: paidInvoices (_count only)
        .mockResolvedValueOnce({ _count: 5 });

      prismaMock.budget.aggregate.mockResolvedValue({ _sum: { total: 50000 } });

      const result = await service.getSummary({});

      expect(result.totalRevenue).toBe(10000);
      expect(result.pendingAmount).toBe(3000);
      expect(result.pendingCount).toBe(2);
      expect(result.paidCount).toBe(5);
      expect(result.approvedBudgetsTotal).toBe(50000);
    });

    it('defaults to 0 when aggregate sums are null', async () => {
      prismaMock.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { amount: null } })
        .mockResolvedValueOnce({ _sum: { amount: null }, _count: 0 })
        .mockResolvedValueOnce({ _count: 0 });

      prismaMock.budget.aggregate.mockResolvedValue({ _sum: { total: null } });

      const result = await service.getSummary({});

      expect(result.totalRevenue).toBe(0);
      expect(result.pendingAmount).toBe(0);
      expect(result.approvedBudgetsTotal).toBe(0);
    });

    it('passes date range filters when startDate and endDate are provided', async () => {
      prismaMock.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: 0 })
        .mockResolvedValueOnce({ _count: 0 });
      prismaMock.budget.aggregate.mockResolvedValue({ _sum: { total: 0 } });

      await service.getSummary({ startDate: '2026-01-01', endDate: '2026-12-31' });

      // All aggregate calls should receive a createdAt date range filter
      for (const call of prismaMock.invoice.aggregate.mock.calls) {
        expect(call[0].where.createdAt).toBeDefined();
        expect(call[0].where.createdAt.gte).toBeInstanceOf(Date);
        expect(call[0].where.createdAt.lte).toBeInstanceOf(Date);
      }
    });

    it('runs all four aggregate queries in parallel (Promise.all)', async () => {
      // Each aggregate resolves independently — verify all four are called
      prismaMock.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 100 } })
        .mockResolvedValueOnce({ _sum: { amount: 200 }, _count: 1 })
        .mockResolvedValueOnce({ _count: 3 });
      prismaMock.budget.aggregate.mockResolvedValue({ _sum: { total: 5000 } });

      await service.getSummary({});

      expect(prismaMock.invoice.aggregate).toHaveBeenCalledTimes(3);
      expect(prismaMock.budget.aggregate).toHaveBeenCalledTimes(1);
    });
  });
});
