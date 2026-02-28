import { Router } from 'express';
import { FinanceController } from './finance.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware, requireRole } from '../../middlewares/auth';
import { createBudgetSchema, updateBudgetSchema, createInvoiceSchema, updateInvoiceSchema } from './finance.schema';

const router = Router();
const controller = new FinanceController();

router.use(authMiddleware);

// Budgets — leitura: todos; escrita: ADMIN e MANAGER
router.get('/budgets', (req, res) => controller.findAllBudgets(req, res));
router.get('/budgets/:id/pdf', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.exportBudgetPdf(req, res));
router.get('/budgets/:id', (req, res) => controller.findBudgetById(req, res));
router.post('/budgets', requireRole('ADMIN', 'MANAGER'), validate(createBudgetSchema), (req, res) => controller.createBudget(req, res));
router.put('/budgets/:id', requireRole('ADMIN', 'MANAGER'), validate(updateBudgetSchema), (req, res) => controller.updateBudget(req, res));
router.delete('/budgets/:id', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.deleteBudget(req, res));

// Invoices — leitura: todos; escrita: ADMIN e MANAGER
router.get('/invoices', (req, res) => controller.findAllInvoices(req, res));
router.get('/invoices/:id/pdf', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.exportInvoicePdf(req, res));
router.get('/invoices/:id', (req, res) => controller.findInvoiceById(req, res));
router.post('/invoices', requireRole('ADMIN', 'MANAGER'), validate(createInvoiceSchema), (req, res) => controller.createInvoice(req, res));
router.put('/invoices/:id', requireRole('ADMIN', 'MANAGER'), validate(updateInvoiceSchema), (req, res) => controller.updateInvoice(req, res));
router.delete('/invoices/:id', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.deleteInvoice(req, res));

// Summary — apenas ADMIN e MANAGER
router.get('/summary', requireRole('ADMIN', 'MANAGER'), (req, res) => controller.getSummary(req, res));

export default router;
