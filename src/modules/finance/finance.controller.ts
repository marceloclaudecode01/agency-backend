import { Request, Response } from 'express';
import { FinanceService } from './finance.service';
import { ApiResponse } from '../../utils/api-response';
import { pdfService } from './pdf.service';

const financeService = new FinanceService();

export class FinanceController {
  // Budgets
  async findAllBudgets(req: Request, res: Response) {
    try {
      const budgets = await financeService.findAllBudgets(req.query as any);
      return ApiResponse.success(res, budgets);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch budgets');
    }
  }

  async findBudgetById(req: Request, res: Response) {
    try {
      const budget = await financeService.findBudgetById(req.params.id as string);
      return ApiResponse.success(res, budget);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch budget');
    }
  }

  async deleteBudget(req: Request, res: Response) {
    try {
      await financeService.deleteBudget(req.params.id as string);
      return ApiResponse.success(res, null, 'Budget deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete budget');
    }
  }

  async createBudget(req: Request, res: Response) {
    try {
      const budget = await financeService.createBudget(req.body);
      return ApiResponse.created(res, budget, 'Budget created successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to create budget');
    }
  }

  async updateBudget(req: Request, res: Response) {
    try {
      const budget = await financeService.updateBudget(req.params.id as string, req.body);
      return ApiResponse.success(res, budget, 'Budget updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update budget');
    }
  }

  // Invoices
  async findAllInvoices(req: Request, res: Response) {
    try {
      const invoices = await financeService.findAllInvoices(req.query as any);
      return ApiResponse.success(res, invoices);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch invoices');
    }
  }

  async findInvoiceById(req: Request, res: Response) {
    try {
      const invoice = await financeService.findInvoiceById(req.params.id as string);
      return ApiResponse.success(res, invoice);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to fetch invoice');
    }
  }

  async deleteInvoice(req: Request, res: Response) {
    try {
      await financeService.deleteInvoice(req.params.id as string);
      return ApiResponse.success(res, null, 'Invoice deleted successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to delete invoice');
    }
  }

  async createInvoice(req: Request, res: Response) {
    try {
      const invoice = await financeService.createInvoice(req.body);
      return ApiResponse.created(res, invoice, 'Invoice created successfully');
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to create invoice');
    }
  }

  async updateInvoice(req: Request, res: Response) {
    try {
      const invoice = await financeService.updateInvoice(req.params.id as string, req.body);
      return ApiResponse.success(res, invoice, 'Invoice updated successfully');
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to update invoice');
    }
  }

  // Budget PDF export
  async exportBudgetPdf(req: Request, res: Response) {
    try {
      const budget = await financeService.findBudgetById(req.params.id as string);
      const buffer = await pdfService.generateBudgetPdf(budget as any);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="orcamento-${budget.id}.pdf"`);
      res.setHeader('Content-Length', buffer.length);
      return res.end(buffer);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to generate budget PDF');
    }
  }

  // Invoice PDF export
  async exportInvoicePdf(req: Request, res: Response) {
    try {
      const invoice = await financeService.findInvoiceById(req.params.id as string);
      const buffer = await pdfService.generateInvoicePdf(invoice as any);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="fatura-${invoice.id}.pdf"`);
      res.setHeader('Content-Length', buffer.length);
      return res.end(buffer);
    } catch (error: any) {
      if (error.statusCode === 404) return ApiResponse.notFound(res, error.message);
      return ApiResponse.error(res, 'Failed to generate invoice PDF');
    }
  }

  // Summary
  async getSummary(req: Request, res: Response) {
    try {
      const summary = await financeService.getSummary(req.query as any);
      return ApiResponse.success(res, summary);
    } catch (error: any) {
      return ApiResponse.error(res, 'Failed to fetch financial summary');
    }
  }
}
