import { Router } from 'express';
import { FinanceController } from './finance.controller';
import { validate } from '../../middlewares/validate';
import { authMiddleware } from '../../middlewares/auth';
import { createBudgetSchema, updateBudgetSchema, createInvoiceSchema, updateInvoiceSchema } from './finance.schema';

const router = Router();
const controller = new FinanceController();

router.use(authMiddleware);

// Budgets
router.get('/budgets', (req, res) => controller.findAllBudgets(req, res));
router.get('/budgets/:id', (req, res) => controller.findBudgetById(req, res));
router.post('/budgets', validate(createBudgetSchema), (req, res) => controller.createBudget(req, res));
router.put('/budgets/:id', validate(updateBudgetSchema), (req, res) => controller.updateBudget(req, res));
router.delete('/budgets/:id', (req, res) => controller.deleteBudget(req, res));

// Invoices
router.get('/invoices', (req, res) => controller.findAllInvoices(req, res));
router.get('/invoices/:id', (req, res) => controller.findInvoiceById(req, res));
router.post('/invoices', validate(createInvoiceSchema), (req, res) => controller.createInvoice(req, res));
router.put('/invoices/:id', validate(updateInvoiceSchema), (req, res) => controller.updateInvoice(req, res));
router.delete('/invoices/:id', (req, res) => controller.deleteInvoice(req, res));

// Summary
router.get('/summary', (req, res) => controller.getSummary(req, res));

export default router;
