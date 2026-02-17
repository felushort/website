/**
 * Data Export and Import System
 * Allows workspaces to export and import data in various formats
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { Readable } from 'stream';

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  XLSX = 'xlsx',
  PDF = 'pdf',
}

export enum ExportType {
  WORKSPACE = 'workspace',
  REVENUE = 'revenue',
  PLAYERS = 'players',
  STAFF = 'staff',
  APPLICATIONS = 'applications',
  AUDIT_LOGS = 'audit_logs',
  FULL_BACKUP = 'full_backup',
}

export interface ExportOptions {
  workspaceId: string;
  type: ExportType;
  format: ExportFormat;
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: Record<string, unknown>;
  includeDeleted?: boolean;
}

export interface ExportJob {
  id: string;
  workspaceId: string;
  type: ExportType;
  format: ExportFormat;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  downloadUrl?: string;
  expiresAt?: Date;
  error?: string;
  createdById: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ImportOptions {
  workspaceId: string;
  type: ExportType;
  format: ExportFormat;
  data: string | Buffer;
  validateOnly?: boolean;
  skipDuplicates?: boolean;
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
}

class DataExportImportService {
  /**
   * Create an export job
   */
  async createExportJob(options: ExportOptions, userId: string): Promise<ExportJob> {
    try {
      logger.info('Creating export job', {
        workspaceId: options.workspaceId,
        type: options.type,
        format: options.format,
      });

      const job: ExportJob = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: options.workspaceId,
        type: options.type,
        format: options.format,
        status: 'pending',
        progress: 0,
        createdById: userId,
        createdAt: new Date(),
      };

      // Log in audit
      await prisma.auditLog.create({
        data: {
          workspaceId: options.workspaceId,
          userId,
          action: 'data.export.started',
          entityType: 'export',
          entityId: job.id,
          metadata: {
            type: options.type,
            format: options.format,
          },
        },
      });

      // In a real app, start background job to process export
      // this.processExport(job, options);

      return job;
    } catch (error) {
      logger.error('Failed to create export job', error as Error, {
        workspaceId: options.workspaceId,
      });
      throw error;
    }
  }

  /**
   * Process export job (background task)
   */
  private async processExport(job: ExportJob, options: ExportOptions): Promise<void> {
    try {
      job.status = 'processing';

      let data: unknown;

      switch (options.type) {
        case ExportType.REVENUE:
          data = await this.exportRevenue(options);
          break;
        case ExportType.PLAYERS:
          data = await this.exportPlayers(options);
          break;
        case ExportType.STAFF:
          data = await this.exportStaff(options);
          break;
        case ExportType.AUDIT_LOGS:
          data = await this.exportAuditLogs(options);
          break;
        case ExportType.FULL_BACKUP:
          data = await this.exportFullBackup(options);
          break;
        default:
          throw new Error(`Unsupported export type: ${options.type}`);
      }

      // Format data
      const formatted = await this.formatData(data, options.format);

      // Upload to storage (S3, etc.)
      const downloadUrl = await this.uploadExport(job.id, formatted, options.format);

      job.status = 'completed';
      job.progress = 100;
      job.downloadUrl = downloadUrl;
      job.completedAt = new Date();
      job.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      logger.info('Export job completed', {
        jobId: job.id,
        downloadUrl,
      });
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      logger.error('Export job failed', error as Error, { jobId: job.id });
    }
  }

  /**
   * Export revenue data
   */
  private async exportRevenue(options: ExportOptions): Promise<unknown[]> {
    const where: any = {
      workspaceId: options.workspaceId,
    };

    if (options.dateRange) {
      where.date = {
        gte: options.dateRange.start,
        lte: options.dateRange.end,
      };
    }

    const revenues = await prisma.revenueEntry.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    return revenues.map(r => ({
      id: r.id,
      date: r.date.toISOString(),
      source: r.source,
      productName: r.productName,
      amount: r.amount.toString(),
      currency: r.currency,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Export player data
   */
  private async exportPlayers(options: ExportOptions): Promise<unknown[]> {
    const players = await prisma.playerProfile.findMany({
      where: { workspaceId: options.workspaceId },
      include: {
        playerIdentity: true,
        incidents: true,
      },
    });

    return players.map(p => ({
      id: p.id,
      globalPlayerId: p.playerIdentity.globalPlayerId,
      minecraftUuid: p.playerIdentity.minecraftUuid,
      knownUsernames: p.playerIdentity.knownUsernames,
      reputationScore: p.reputationScore,
      warningCount: p.warningCount,
      notes: p.notes,
      incidentCount: p.incidents.length,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  /**
   * Export staff data
   */
  private async exportStaff(options: ExportOptions): Promise<unknown[]> {
    const where: any = {
      workspaceId: options.workspaceId,
    };

    if (options.dateRange) {
      where.createdAt = {
        gte: options.dateRange.start,
        lte: options.dateRange.end,
      };
    }

    const applications = await prisma.application.findMany({
      where,
      include: {
        jobPost: true,
        applicantUser: true,
      },
    });

    return applications.map(a => ({
      id: a.id,
      jobTitle: a.jobPost.title,
      applicantEmail: a.applicantUser?.email,
      applicantTag: a.applicantTag,
      status: a.status,
      answers: a.answers,
      internalNotes: a.internalNotes,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
  }

  /**
   * Export audit logs
   */
  private async exportAuditLogs(options: ExportOptions): Promise<unknown[]> {
    const where: any = {
      workspaceId: options.workspaceId,
    };

    if (options.dateRange) {
      where.createdAt = {
        gte: options.dateRange.start,
        lte: options.dateRange.end,
      };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map(l => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      userName: l.user?.displayName,
      userEmail: l.user?.email,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  /**
   * Export full workspace backup
   */
  private async exportFullBackup(options: ExportOptions): Promise<Record<string, unknown>> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: options.workspaceId },
      include: {
        owner: true,
        members: { include: { user: true } },
        subscriptions: true,
        revenueEntries: true,
        products: true,
        jobPosts: true,
        applications: { include: { jobPost: true } },
        playerProfiles: { include: { playerIdentity: true, incidents: true } },
        auditLogs: { include: { user: true } },
      },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt.toISOString(),
      },
      owner: {
        email: workspace.owner.email,
        displayName: workspace.owner.displayName,
      },
      members: workspace.members.map(m => ({
        email: m.user.email,
        displayName: m.user.displayName,
        role: m.role,
      })),
      subscriptions: workspace.subscriptions,
      revenue: workspace.revenueEntries,
      products: workspace.products,
      jobPosts: workspace.jobPosts,
      applications: workspace.applications,
      players: workspace.playerProfiles,
      auditLogs: workspace.auditLogs,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
  }

  /**
   * Format data for export
   */
  private async formatData(data: unknown, format: ExportFormat): Promise<Buffer | string> {
    switch (format) {
      case ExportFormat.JSON:
        return JSON.stringify(data, null, 2);

      case ExportFormat.CSV:
        return this.convertToCSV(data);

      case ExportFormat.XLSX:
        // Would use a library like 'xlsx' or 'exceljs'
        throw new Error('XLSX export not yet implemented');

      case ExportFormat.PDF:
        // Would use a library like 'pdfkit' or 'puppeteer'
        throw new Error('PDF export not yet implemented');

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: unknown): string {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(item =>
      headers.map(header => {
        const value = (item as any)[header];
        const stringValue = value === null || value === undefined ? '' : String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Upload export file to storage
   */
  private async uploadExport(jobId: string, data: Buffer | string, format: ExportFormat): Promise<string> {
    // In a real app, upload to S3 or similar storage
    // For now, return a placeholder URL
    const extension = format === ExportFormat.JSON ? 'json' : 'csv';
    return `https://exports.serverforge.io/${jobId}.${extension}`;
  }

  /**
   * Import data
   */
  async importData(options: ImportOptions, userId: string): Promise<ImportResult> {
    try {
      logger.info('Starting data import', {
        workspaceId: options.workspaceId,
        type: options.type,
        format: options.format,
        validateOnly: options.validateOnly,
      });

      const result: ImportResult = {
        success: true,
        recordsImported: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: [],
      };

      // Parse data
      const parsed = await this.parseImportData(options.data, options.format);

      // Validate data
      const validation = await this.validateImportData(parsed, options.type);
      
      if (!validation.valid) {
        result.success = false;
        result.errors = validation.errors;
        return result;
      }

      // If validate only, return here
      if (options.validateOnly) {
        return result;
      }

      // Import data
      switch (options.type) {
        case ExportType.REVENUE:
          await this.importRevenue(options.workspaceId, parsed, result, options.skipDuplicates);
          break;
        case ExportType.PLAYERS:
          await this.importPlayers(options.workspaceId, parsed, result, options.skipDuplicates);
          break;
        default:
          throw new Error(`Import not supported for type: ${options.type}`);
      }

      // Log in audit
      await prisma.auditLog.create({
        data: {
          workspaceId: options.workspaceId,
          userId,
          action: 'data.import.completed',
          entityType: 'import',
          metadata: {
            type: options.type,
            recordsImported: result.recordsImported,
            recordsSkipped: result.recordsSkipped,
            recordsFailed: result.recordsFailed,
          },
        },
      });

      logger.info('Data import completed', {
        workspaceId: options.workspaceId,
        result,
      });

      return result;
    } catch (error) {
      logger.error('Data import failed', error as Error, {
        workspaceId: options.workspaceId,
      });
      throw error;
    }
  }

  /**
   * Parse import data
   */
  private async parseImportData(data: string | Buffer, format: ExportFormat): Promise<unknown[]> {
    const dataString = Buffer.isBuffer(data) ? data.toString('utf-8') : data;

    switch (format) {
      case ExportFormat.JSON:
        const parsed = JSON.parse(dataString);
        return Array.isArray(parsed) ? parsed : [parsed];

      case ExportFormat.CSV:
        return this.parseCSV(dataString);

      default:
        throw new Error(`Import not supported for format: ${format}`);
    }
  }

  /**
   * Parse CSV data
   */
  private parseCSV(csvData: string): unknown[] {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const records: unknown[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const record: any = {};
      
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      
      records.push(record);
    }

    return records;
  }

  /**
   * Validate import data
   */
  private async validateImportData(
    data: unknown[],
    type: ExportType
  ): Promise<{
    valid: boolean;
    errors: Array<{ row: number; field?: string; message: string }>;
  }> {
    const errors: Array<{ row: number; field?: string; message: string }> = [];

    // Validate each record based on type
    data.forEach((record, index) => {
      // Add validation logic based on type
      if (!record || typeof record !== 'object') {
        errors.push({
          row: index + 1,
          message: 'Invalid record format',
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Import revenue data
   */
  private async importRevenue(
    workspaceId: string,
    data: unknown[],
    result: ImportResult,
    skipDuplicates?: boolean
  ): Promise<void> {
    for (const record of data) {
      try {
        const r = record as any;
        
        await prisma.revenueEntry.create({
          data: {
            workspaceId,
            date: new Date(r.date),
            source: r.source,
            productName: r.productName,
            amount: r.amount,
            currency: r.currency || 'USD',
          },
        });

        result.recordsImported++;
      } catch (error) {
        if (skipDuplicates) {
          result.recordsSkipped++;
        } else {
          result.recordsFailed++;
          result.errors.push({
            row: result.recordsImported + result.recordsSkipped + result.recordsFailed,
            message: (error as Error).message,
          });
        }
      }
    }
  }

  /**
   * Import player data
   */
  private async importPlayers(
    workspaceId: string,
    data: unknown[],
    result: ImportResult,
    skipDuplicates?: boolean
  ): Promise<void> {
    // Implementation similar to importRevenue
    logger.info('Importing players', { count: data.length });
  }

  /**
   * Get export job status
   */
  async getExportJob(jobId: string): Promise<ExportJob | null> {
    // In a real app, fetch from database
    logger.info('Fetching export job', { jobId });
    return null;
  }

  /**
   * List export jobs for a workspace
   */
  async listExportJobs(workspaceId: string): Promise<ExportJob[]> {
    logger.info('Listing export jobs', { workspaceId });
    return [];
  }

  /**
   * Delete export job and file
   */
  async deleteExportJob(jobId: string): Promise<void> {
    logger.info('Deleting export job', { jobId });
    // Delete from storage and database
  }
}

export const dataExportImportService = new DataExportImportService();
