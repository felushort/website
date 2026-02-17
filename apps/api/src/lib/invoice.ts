/**
 * Invoice Generation and Management System
 * Handles invoice creation, PDF generation, and billing history
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { emailService, EmailTemplateType } from './email.js';

export interface Invoice {
  id: string;
  workspaceId: string;
  subscriptionId?: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  lineItems: InvoiceLineItem[];
  billingAddress?: BillingAddress;
  notes?: string;
  pdfUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  VOID = 'void',
  REFUNDED = 'refunded',
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate?: number;
  metadata?: Record<string, unknown>;
}

export interface BillingAddress {
  name: string;
  email: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  vatNumber?: string;
}

export interface CreateInvoiceOptions {
  workspaceId: string;
  subscriptionId?: string;
  lineItems: Omit<InvoiceLineItem, 'id' | 'amount'>[];
  billingAddress?: BillingAddress;
  dueInDays?: number;
  taxRate?: number;
  notes?: string;
  sendEmail?: boolean;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  transactionId?: string;
  paidAt: Date;
  metadata?: Record<string, unknown>;
}

class InvoiceService {
  private readonly invoicePrefix = 'INV-';
  private readonly defaultDueDays = 30;
  private readonly defaultTaxRate = 0; // 0% default, varies by jurisdiction

  /**
   * Create a new invoice
   */
  async createInvoice(options: CreateInvoiceOptions): Promise<Invoice> {
    try {
      logger.info('Creating invoice', {
        workspaceId: options.workspaceId,
        lineItems: options.lineItems.length,
      });

      const workspace = await prisma.workspace.findUnique({
        where: { id: options.workspaceId },
        include: { owner: true },
      });

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(options.workspaceId);

      // Calculate line item amounts
      const lineItems: InvoiceLineItem[] = options.lineItems.map((item, index) => ({
        id: `li_${index + 1}`,
        ...item,
        amount: item.quantity * item.unitPrice,
      }));

      // Calculate totals
      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
      const taxRate = options.taxRate ?? this.defaultTaxRate;
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      const now = new Date();
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + (options.dueInDays || this.defaultDueDays));

      const invoice: Invoice = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: options.workspaceId,
        subscriptionId: options.subscriptionId,
        invoiceNumber,
        status: InvoiceStatus.DRAFT,
        issueDate: now,
        dueDate,
        subtotal,
        tax,
        total,
        currency: 'USD',
        lineItems,
        billingAddress: options.billingAddress,
        notes: options.notes,
        createdAt: now,
        updatedAt: now,
      };

      // In production, save to database
      // await saveInvoice(invoice);

      logger.info('Invoice created', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
      });

      // Generate PDF
      invoice.pdfUrl = await this.generateInvoicePDF(invoice);

      // Send email if requested
      if (options.sendEmail) {
        await this.sendInvoiceEmail(invoice, workspace.owner.email);
      }

      return invoice;
    } catch (error) {
      logger.error('Failed to create invoice', error as Error, {
        workspaceId: options.workspaceId,
      });
      throw error;
    }
  }

  /**
   * Generate invoice number
   */
  private async generateInvoiceNumber(workspaceId: string): Promise<string> {
    // In production, get next sequence number from database
    const sequence = Math.floor(Math.random() * 10000) + 1000;
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    return `${this.invoicePrefix}${year}${month}-${sequence}`;
  }

  /**
   * Generate invoice PDF
   */
  private async generateInvoicePDF(invoice: Invoice): Promise<string> {
    logger.info('Generating invoice PDF', { invoiceId: invoice.id });

    // In production, use PDF generation library like pdfkit or puppeteer
    // const pdf = await generatePDF(invoice);
    // const url = await uploadToStorage(pdf);

    return `https://storage.serverforge.io/invoices/${invoice.invoiceNumber}.pdf`;
  }

  /**
   * Send invoice email
   */
  private async sendInvoiceEmail(invoice: Invoice, recipientEmail: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email: recipientEmail },
    });

    if (!user) return;

    await emailService.sendTemplateEmail(
      recipientEmail,
      EmailTemplateType.INVOICE_GENERATED,
      {
        displayName: user.displayName,
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.issueDate.toISOString().split('T')[0],
        amount: `${invoice.currency} ${invoice.total.toFixed(2)}`,
        status: invoice.status,
        downloadUrl: invoice.pdfUrl || '#',
      }
    );
  }

  /**
   * Mark invoice as sent
   */
  async markAsSent(invoiceId: string): Promise<void> {
    logger.info('Marking invoice as sent', { invoiceId });

    // In production, update in database
    // await updateInvoice(invoiceId, { status: InvoiceStatus.SENT });
  }

  /**
   * Mark invoice as paid
   */
  async markAsPaid(invoiceId: string, payment: Omit<PaymentRecord, 'id'>): Promise<void> {
    try {
      logger.info('Marking invoice as paid', { invoiceId });

      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Record payment
      const paymentRecord: PaymentRecord = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...payment,
      };

      // In production:
      // - Save payment record
      // - Update invoice status
      // - Send payment confirmation email

      await prisma.auditLog.create({
        data: {
          workspaceId: invoice.workspaceId,
          action: 'invoice.paid',
          entityType: 'invoice',
          entityId: invoiceId,
          metadata: {
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
          },
        },
      });

      logger.info('Invoice marked as paid', { invoiceId });
    } catch (error) {
      logger.error('Failed to mark invoice as paid', error as Error, { invoiceId });
      throw error;
    }
  }

  /**
   * Void an invoice
   */
  async voidInvoice(invoiceId: string, reason: string): Promise<void> {
    logger.info('Voiding invoice', { invoiceId, reason });

    // In production, update invoice status
    // await updateInvoice(invoiceId, { status: InvoiceStatus.VOID, notes: reason });
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    logger.debug('Fetching invoice', { invoiceId });
    
    // In production, fetch from database
    return null;
  }

  /**
   * List invoices for workspace
   */
  async listInvoices(
    workspaceId: string,
    options: {
      status?: InvoiceStatus;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    invoices: Invoice[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, status } = options;

    logger.info('Listing invoices', { workspaceId, status, page, limit });

    // In production, fetch from database with filters
    return {
      invoices: [],
      total: 0,
      page,
      limit,
    };
  }

  /**
   * Get upcoming invoices
   */
  async getUpcomingInvoices(workspaceId: string): Promise<Invoice[]> {
    logger.info('Fetching upcoming invoices', { workspaceId });

    // In production, calculate upcoming invoices based on subscriptions
    return [];
  }

  /**
   * Check for overdue invoices
   */
  async checkOverdueInvoices(): Promise<void> {
    logger.info('Checking for overdue invoices');

    try {
      // In production:
      // 1. Find invoices where dueDate < now and status = sent
      // 2. Update status to overdue
      // 3. Send reminder emails

      await prisma.auditLog.create({
        data: {
          action: 'invoices.overdue_check.completed',
          entityType: 'invoice',
        },
      });
    } catch (error) {
      logger.error('Failed to check overdue invoices', error as Error);
    }
  }

  /**
   * Send payment reminder
   */
  async sendPaymentReminder(invoiceId: string): Promise<void> {
    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) return;

    const workspace = await prisma.workspace.findUnique({
      where: { id: invoice.workspaceId },
      include: { owner: true },
    });

    if (!workspace) return;

    await emailService.sendCustomEmail({
      to: workspace.owner.email,
      subject: `Payment Reminder: Invoice ${invoice.invoiceNumber}`,
      html: `
        <p>Hi ${workspace.owner.displayName},</p>
        <p>This is a friendly reminder that invoice ${invoice.invoiceNumber} is due soon.</p>
        <p><strong>Amount Due:</strong> ${invoice.currency} ${invoice.total.toFixed(2)}</p>
        <p><strong>Due Date:</strong> ${invoice.dueDate.toISOString().split('T')[0]}</p>
        <p><a href="${invoice.pdfUrl}">View Invoice</a></p>
      `,
    });

    logger.info('Payment reminder sent', { invoiceId });
  }

  /**
   * Calculate revenue from invoices
   */
  async calculateRevenue(
    workspaceId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<{
    totalRevenue: number;
    paidInvoices: number;
    pendingRevenue: number;
    overdueRevenue: number;
  }> {
    logger.info('Calculating invoice revenue', { workspaceId, dateRange });

    // In production, aggregate from database
    return {
      totalRevenue: 0,
      paidInvoices: 0,
      pendingRevenue: 0,
      overdueRevenue: 0,
    };
  }

  /**
   * Export invoices to CSV
   */
  async exportInvoicesToCSV(workspaceId: string): Promise<string> {
    logger.info('Exporting invoices to CSV', { workspaceId });

    const invoices = await this.listInvoices(workspaceId, { limit: 1000 });

    const headers = [
      'Invoice Number',
      'Status',
      'Issue Date',
      'Due Date',
      'Subtotal',
      'Tax',
      'Total',
      'Currency',
    ];

    const rows = invoices.invoices.map(inv => [
      inv.invoiceNumber,
      inv.status,
      inv.issueDate.toISOString().split('T')[0],
      inv.dueDate.toISOString().split('T')[0],
      inv.subtotal.toFixed(2),
      inv.tax.toFixed(2),
      inv.total.toFixed(2),
      inv.currency,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    return csv;
  }

  /**
   * Get billing summary
   */
  async getBillingSummary(workspaceId: string): Promise<{
    currentPeriod: {
      revenue: number;
      invoiceCount: number;
    };
    lastPeriod: {
      revenue: number;
      invoiceCount: number;
    };
    outstanding: {
      amount: number;
      count: number;
    };
    overdue: {
      amount: number;
      count: number;
    };
  }> {
    logger.info('Fetching billing summary', { workspaceId });

    // In production, calculate from database
    return {
      currentPeriod: { revenue: 0, invoiceCount: 0 },
      lastPeriod: { revenue: 0, invoiceCount: 0 },
      outstanding: { amount: 0, count: 0 },
      overdue: { amount: 0, count: 0 },
    };
  }
}

export const invoiceService = new InvoiceService();
