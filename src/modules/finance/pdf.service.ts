import PDFDocument from 'pdfkit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface InvoiceWithRelations {
  id: string;
  amount: number;
  status: string;
  dueDate?: Date | null;
  paidAt?: Date | null;
  createdAt: Date;
  client: {
    id: string;
    name: string;
    email?: string | null;
    company?: string | null;
  };
  budget?: {
    id: string;
    total: number;
    status: string;
    items?: InvoiceItem[];
  } | null;
}

export interface BudgetItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface BudgetWithRelations {
  id: string;
  title: string;
  total: number;
  status: string;
  items: unknown;
  validUntil?: Date | null;
  createdAt: Date;
  client: {
    id: string;
    name: string;
    email?: string | null;
    company?: string | null;
  };
  campaign?: { id: string; name: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR');
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'PENDENTE',
    PAID: 'PAGO',
    OVERDUE: 'VENCIDA',
    CANCELLED: 'CANCELADA',
  };
  return map[status] ?? status;
}

function statusLabelBudget(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'RASCUNHO',
    SENT: 'ENVIADO',
    APPROVED: 'APROVADO',
    REJECTED: 'REJEITADO',
  };
  return map[status] ?? status;
}

// ─── Private helper: base document ────────────────────────────────────────────

function createPdfDocument(): InstanceType<typeof PDFDocument> {
  return new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 60, right: 60 },
    info: { Creator: 'Agência de Marketing Digital' },
  });
}

// ─── Public Service ────────────────────────────────────────────────────────────

export class PdfService {
  /**
   * Generates a PDF buffer for the given invoice.
   */
  generateInvoicePdf(invoice: InvoiceWithRelations): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = createPdfDocument();
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const primaryColor = '#2563EB';   // blue-600
        const textDark = '#111827';
        const textMid = '#6B7280';
        const borderColor = '#E5E7EB';
        const pageWidth = doc.page.width - 120; // left 60 + right 60

        // ── HEADER ────────────────────────────────────────────────────────────
        // Agency branding block
        doc
          .rect(60, 40, pageWidth, 70)
          .fillColor(primaryColor)
          .fill();

        doc
          .fillColor('#FFFFFF')
          .fontSize(22)
          .font('Helvetica-Bold')
          .text('AGÊNCIA', 80, 58)
          .fontSize(9)
          .font('Helvetica')
          .text('Marketing Digital', 80, 83);

        // Invoice label (top right inside header)
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .fillColor('#FFFFFF')
          .text('FATURA', 0, 55, { align: 'right' });

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#DBEAFE')
          .text(`Nº ${invoice.id.substring(0, 8).toUpperCase()}`, 0, 80, { align: 'right' });

        // ── META INFO ROW ─────────────────────────────────────────────────────
        const metaY = 130;
        doc.fillColor(textMid).fontSize(8).font('Helvetica');

        doc.text('Data de Emissão', 60, metaY);
        doc
          .fillColor(textDark)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(formatDate(invoice.createdAt), 60, metaY + 13);

        doc.fillColor(textMid).fontSize(8).font('Helvetica').text('Vencimento', 200, metaY);
        doc
          .fillColor(textDark)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(formatDate(invoice.dueDate), 200, metaY + 13);

        // Status badge (right side)
        const statusText = statusLabel(invoice.status);
        const badgeColors: Record<string, string> = {
          PAID: '#16A34A',
          PENDING: '#D97706',
          OVERDUE: '#DC2626',
          CANCELLED: '#6B7280',
        };
        const badgeColor = badgeColors[invoice.status] ?? '#6B7280';

        doc
          .roundedRect(doc.page.width - 160, metaY, 100, 24, 4)
          .fillColor(badgeColor)
          .fill();
        doc
          .fillColor('#FFFFFF')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(statusText, doc.page.width - 160, metaY + 8, { width: 100, align: 'center' });

        // ── DIVIDER ───────────────────────────────────────────────────────────
        doc
          .moveTo(60, 170)
          .lineTo(doc.page.width - 60, 170)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        // ── CLIENT INFO ───────────────────────────────────────────────────────
        const clientY = 185;
        doc.fillColor(textMid).fontSize(8).font('Helvetica').text('FATURADO PARA', 60, clientY);
        doc
          .fillColor(textDark)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(invoice.client.name, 60, clientY + 14);

        if (invoice.client.company) {
          doc
            .fillColor(textMid)
            .fontSize(9)
            .font('Helvetica')
            .text(invoice.client.company, 60, clientY + 30);
        }

        if (invoice.client.email) {
          const emailY = invoice.client.company ? clientY + 44 : clientY + 30;
          doc.fillColor(textMid).fontSize(9).font('Helvetica').text(invoice.client.email, 60, emailY);
        }

        // ── ITEMS TABLE ───────────────────────────────────────────────────────
        const tableStartY = 265;
        const colX = { desc: 60, qty: 310, unit: 380, sub: 460 };

        // Table header
        doc
          .rect(60, tableStartY, pageWidth, 24)
          .fillColor('#F3F4F6')
          .fill();

        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('DESCRIÇÃO', colX.desc + 4, tableStartY + 8)
          .text('QTD', colX.qty, tableStartY + 8)
          .text('VALOR UNIT.', colX.unit, tableStartY + 8)
          .text('SUBTOTAL', colX.sub, tableStartY + 8);

        // Build item rows from budget items or fallback single row
        let budgetItems: InvoiceItem[] = [];
        if (invoice.budget?.items && Array.isArray(invoice.budget.items)) {
          budgetItems = invoice.budget.items as InvoiceItem[];
        }

        if (budgetItems.length === 0) {
          // Single row representing the invoice amount
          budgetItems = [
            {
              description: 'Serviços de Marketing Digital',
              quantity: 1,
              unitPrice: invoice.amount,
              subtotal: invoice.amount,
            },
          ];
        }

        let rowY = tableStartY + 24;
        budgetItems.forEach((item, idx) => {
          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
          doc.rect(60, rowY, pageWidth, 22).fillColor(rowBg).fill();

          doc
            .fillColor(textDark)
            .fontSize(9)
            .font('Helvetica')
            .text(item.description ?? '-', colX.desc + 4, rowY + 7, { width: colX.qty - colX.desc - 12 })
            .text(String(item.quantity ?? 1), colX.qty, rowY + 7)
            .text(formatCurrency(item.unitPrice ?? 0), colX.unit, rowY + 7)
            .text(formatCurrency(item.subtotal ?? 0), colX.sub, rowY + 7);

          rowY += 22;
        });

        // Table bottom border
        doc
          .moveTo(60, rowY)
          .lineTo(doc.page.width - 60, rowY)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        // ── TOTALS ────────────────────────────────────────────────────────────
        const totalAreaX = 380;
        let totalY = rowY + 16;

        // Total row
        doc
          .rect(totalAreaX, totalY, pageWidth - (totalAreaX - 60), 32)
          .fillColor(primaryColor)
          .fill();

        doc
          .fillColor('#FFFFFF')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('TOTAL', totalAreaX + 8, totalY + 10)
          .text(formatCurrency(invoice.amount), colX.sub, totalY + 10);

        totalY += 32;

        // ── PAYMENT INSTRUCTIONS ──────────────────────────────────────────────
        const footerY = totalY + 30;

        doc
          .moveTo(60, footerY)
          .lineTo(doc.page.width - 60, footerY)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('INSTRUÇÕES DE PAGAMENTO', 60, footerY + 12);

        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica')
          .text(
            'Entre em contato com nossa equipe para informações sobre métodos de pagamento disponíveis. ' +
              'Após a confirmação do pagamento, o recibo será enviado por e-mail.',
            60,
            footerY + 26,
            { width: pageWidth }
          );

        // Due date reminder
        if (invoice.dueDate) {
          doc
            .fillColor(invoice.status === 'OVERDUE' ? '#DC2626' : textMid)
            .fontSize(8)
            .font('Helvetica-Bold')
            .text(`Data de vencimento: ${formatDate(invoice.dueDate)}`, 60, footerY + 52);
        }

        // ── FOOTER ────────────────────────────────────────────────────────────
        const pageBottom = doc.page.height - 50;
        doc
          .moveTo(60, pageBottom - 20)
          .lineTo(doc.page.width - 60, pageBottom - 20)
          .strokeColor(borderColor)
          .lineWidth(0.5)
          .stroke();

        doc
          .fillColor(textMid)
          .fontSize(7)
          .font('Helvetica')
          .text(
            `Fatura gerada em ${formatDate(new Date())} · Agência de Marketing Digital · ID: ${invoice.id}`,
            60,
            pageBottom - 12,
            { align: 'center', width: pageWidth }
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates a PDF buffer for the given budget.
   * Implemented in Story 3.3.
   */
  generateBudgetPdf(budget: BudgetWithRelations): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = createPdfDocument();
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const accentColor = '#7C3AED';   // violet-700 — distinct from invoice blue
        const textDark = '#111827';
        const textMid = '#6B7280';
        const borderColor = '#E5E7EB';
        const pageWidth = doc.page.width - 120; // left 60 + right 60

        // ── HEADER ──────────────────────────────────────────────────────────
        doc
          .rect(60, 40, pageWidth, 70)
          .fillColor(accentColor)
          .fill();

        doc
          .fillColor('#FFFFFF')
          .fontSize(22)
          .font('Helvetica-Bold')
          .text('AGÊNCIA', 80, 58)
          .fontSize(9)
          .font('Helvetica')
          .text('Marketing Digital', 80, 83);

        // Document label (top right inside header)
        doc
          .fontSize(18)
          .font('Helvetica-Bold')
          .fillColor('#FFFFFF')
          .text('ORÇAMENTO', 0, 55, { align: 'right' });

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#EDE9FE')
          .text(`Nº ${budget.id.substring(0, 8).toUpperCase()}`, 0, 80, { align: 'right' });

        // ── META INFO ROW ───────────────────────────────────────────────────
        const metaY = 130;
        doc.fillColor(textMid).fontSize(8).font('Helvetica');

        doc.text('Data de Emissão', 60, metaY);
        doc
          .fillColor(textDark)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(formatDate(budget.createdAt), 60, metaY + 13);

        if (budget.validUntil) {
          doc.fillColor(textMid).fontSize(8).font('Helvetica').text('Válido Até', 200, metaY);
          doc
            .fillColor(textDark)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(formatDate(budget.validUntil), 200, metaY + 13);
        }

        // Status badge (right side)
        const budgetStatusText = statusLabelBudget(budget.status);
        const budgetBadgeColors: Record<string, string> = {
          DRAFT: '#6B7280',
          SENT: '#2563EB',
          APPROVED: '#16A34A',
          REJECTED: '#DC2626',
        };
        const budgetBadgeColor = budgetBadgeColors[budget.status] ?? '#6B7280';

        doc
          .roundedRect(doc.page.width - 160, metaY, 100, 24, 4)
          .fillColor(budgetBadgeColor)
          .fill();
        doc
          .fillColor('#FFFFFF')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(budgetStatusText, doc.page.width - 160, metaY + 8, { width: 100, align: 'center' });

        // ── DIVIDER ─────────────────────────────────────────────────────────
        doc
          .moveTo(60, 170)
          .lineTo(doc.page.width - 60, 170)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        // ── CLIENT INFO ─────────────────────────────────────────────────────
        const clientY = 185;
        doc.fillColor(textMid).fontSize(8).font('Helvetica').text('ORÇAMENTO PARA', 60, clientY);
        doc
          .fillColor(textDark)
          .fontSize(12)
          .font('Helvetica-Bold')
          .text(budget.client.name, 60, clientY + 14);

        if (budget.client.company) {
          doc
            .fillColor(textMid)
            .fontSize(9)
            .font('Helvetica')
            .text(budget.client.company, 60, clientY + 30);
        }

        if (budget.client.email) {
          const emailY = budget.client.company ? clientY + 44 : clientY + 30;
          doc.fillColor(textMid).fontSize(9).font('Helvetica').text(budget.client.email, 60, emailY);
        }

        // Budget title label
        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica')
          .text('TÍTULO DO ORÇAMENTO', 320, clientY);
        doc
          .fillColor(textDark)
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(budget.title, 320, clientY + 14, { width: pageWidth - 260 });

        // ── ITEMS TABLE ─────────────────────────────────────────────────────
        const tableStartY = 265;
        const colX = { desc: 60, qty: 310, unit: 380, sub: 460 };

        // Table header
        doc
          .rect(60, tableStartY, pageWidth, 24)
          .fillColor('#F3F4F6')
          .fill();

        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('DESCRIÇÃO', colX.desc + 4, tableStartY + 8)
          .text('QTD', colX.qty, tableStartY + 8)
          .text('VALOR UNIT.', colX.unit, tableStartY + 8)
          .text('SUBTOTAL', colX.sub, tableStartY + 8);

        // Parse budget items from JSON field
        let budgetItems: BudgetItem[] = [];
        if (budget.items && Array.isArray(budget.items)) {
          budgetItems = budget.items as BudgetItem[];
        }

        if (budgetItems.length === 0) {
          // Fallback: single row representing the budget total
          budgetItems = [
            {
              description: budget.title || 'Serviços de Marketing Digital',
              quantity: 1,
              unitPrice: budget.total,
              subtotal: budget.total,
            },
          ];
        }

        let rowY = tableStartY + 24;
        budgetItems.forEach((item, idx) => {
          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
          doc.rect(60, rowY, pageWidth, 22).fillColor(rowBg).fill();

          doc
            .fillColor(textDark)
            .fontSize(9)
            .font('Helvetica')
            .text(item.description ?? '-', colX.desc + 4, rowY + 7, { width: colX.qty - colX.desc - 12 })
            .text(String(item.quantity ?? 1), colX.qty, rowY + 7)
            .text(formatCurrency(item.unitPrice ?? 0), colX.unit, rowY + 7)
            .text(formatCurrency(item.subtotal ?? 0), colX.sub, rowY + 7);

          rowY += 22;
        });

        // Table bottom border
        doc
          .moveTo(60, rowY)
          .lineTo(doc.page.width - 60, rowY)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        // ── TOTALS ──────────────────────────────────────────────────────────
        const totalAreaX = 380;
        let totalY = rowY + 16;

        // Total row
        doc
          .rect(totalAreaX, totalY, pageWidth - (totalAreaX - 60), 32)
          .fillColor(accentColor)
          .fill();

        doc
          .fillColor('#FFFFFF')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('TOTAL', totalAreaX + 8, totalY + 10)
          .text(formatCurrency(budget.total), colX.sub, totalY + 10);

        totalY += 32;

        // ── APPROVAL INSTRUCTIONS ────────────────────────────────────────────
        const footerY = totalY + 30;

        doc
          .moveTo(60, footerY)
          .lineTo(doc.page.width - 60, footerY)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica-Bold')
          .text('APROVAÇÃO', 60, footerY + 12);

        doc
          .fillColor(textMid)
          .fontSize(8)
          .font('Helvetica')
          .text(
            'Para aprovar este orçamento, responda este e-mail com a confirmação ou entre em contato com nossa equipe. ' +
              'Este orçamento é válido conforme a data indicada acima.',
            60,
            footerY + 26,
            { width: pageWidth }
          );

        // Validity reminder
        if (budget.validUntil) {
          doc
            .fillColor(textMid)
            .fontSize(8)
            .font('Helvetica-Bold')
            .text(`Validade: ${formatDate(budget.validUntil)}`, 60, footerY + 52);
        }

        // ── FOOTER ──────────────────────────────────────────────────────────
        const pageBottom = doc.page.height - 50;
        doc
          .moveTo(60, pageBottom - 20)
          .lineTo(doc.page.width - 60, pageBottom - 20)
          .strokeColor(borderColor)
          .lineWidth(0.5)
          .stroke();

        doc
          .fillColor(textMid)
          .fontSize(7)
          .font('Helvetica')
          .text(
            `Orçamento gerado em ${formatDate(new Date())} · Agência de Marketing Digital · ID: ${budget.id}`,
            60,
            pageBottom - 12,
            { align: 'center', width: pageWidth }
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

export const pdfService = new PdfService();
