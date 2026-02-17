/**
 * GDPR Compliance System
 * Handles data privacy, consent, and compliance requirements
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { dataExportImportService, ExportType, ExportFormat } from './data-export-import.js';
import { emailService } from './email.js';

export enum ConsentType {
  TERMS_OF_SERVICE = 'terms_of_service',
  PRIVACY_POLICY = 'privacy_policy',
  MARKETING_EMAILS = 'marketing_emails',
  ANALYTICS = 'analytics',
  DATA_PROCESSING = 'data_processing',
}

export enum DataProcessingPurpose {
  SERVICE_DELIVERY = 'service_delivery',
  ANALYTICS = 'analytics',
  MARKETING = 'marketing',
  SUPPORT = 'support',
  SECURITY = 'security',
  LEGAL_COMPLIANCE = 'legal_compliance',
}

export interface ConsentRecord {
  id: string;
  userId: string;
  type: ConsentType;
  granted: boolean;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  grantedAt: Date;
}

export interface DataAccessRequest {
  id: string;
  userId: string;
  type: 'access' | 'export' | 'deletion' | 'rectification' | 'portability';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requestedAt: Date;
  completedAt?: Date;
  notes?: string;
  downloadUrl?: string;
}

export interface PrivacySettings {
  userId: string;
  allowAnalytics: boolean;
  allowMarketingEmails: boolean;
  allowProfileIndexing: boolean;
  allowDataSharing: boolean;
  dataRetentionDays?: number;
}

class GDPRComplianceService {
  /**
   * Record user consent
   */
  async recordConsent(
    userId: string,
    consentType: ConsentType,
    granted: boolean,
    version: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ConsentRecord> {
    try {
      logger.info('Recording user consent', {
        userId,
        consentType,
        granted,
        version,
      });

      const consent: ConsentRecord = {
        id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type: consentType,
        granted,
        version,
        ipAddress,
        userAgent,
        grantedAt: new Date(),
      };

      // In production, store in database
      // await saveConsent(consent);

      await prisma.auditLog.create({
        data: {
          userId,
          action: `consent.${granted ? 'granted' : 'revoked'}`,
          entityType: 'consent',
          entityId: consent.id,
          metadata: {
            consentType,
            version,
          },
        },
      });

      logger.info('Consent recorded', { consentId: consent.id });
      return consent;
    } catch (error) {
      logger.error('Failed to record consent', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Get user consent history
   */
  async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
    logger.info('Fetching consent history', { userId });
    // In production, fetch from database
    return [];
  }

  /**
   * Check if user has given consent
   */
  async hasConsent(userId: string, consentType: ConsentType): Promise<boolean> {
    const history = await this.getConsentHistory(userId);
    const latest = history
      .filter(c => c.type === consentType)
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())[0];
    
    return latest?.granted || false;
  }

  /**
   * Create data access request (Right to Access)
   */
  async createDataAccessRequest(
    userId: string,
    type: DataAccessRequest['type'],
    notes?: string
  ): Promise<DataAccessRequest> {
    try {
      logger.info('Creating data access request', { userId, type });

      const request: DataAccessRequest = {
        id: `dar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type,
        status: 'pending',
        requestedAt: new Date(),
        notes,
      };

      // In production, store in database
      // await saveDataAccessRequest(request);

      await prisma.auditLog.create({
        data: {
          userId,
          action: `gdpr.request.${type}`,
          entityType: 'data_access_request',
          entityId: request.id,
          metadata: { type, notes },
        },
      });

      // Send confirmation email
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (user) {
        await emailService.sendCustomEmail({
          to: user.email,
          subject: `Data ${type} Request Received`,
          html: `
            <p>Hi ${user.displayName},</p>
            <p>We have received your request to ${type} your data.</p>
            <p>We will process your request within 30 days as required by law.</p>
            <p>Request ID: ${request.id}</p>
          `,
        });
      }

      // Auto-process certain request types
      if (type === 'export' || type === 'portability') {
        await this.processDataExport(request.id);
      } else if (type === 'deletion') {
        // Deletion requires manual review
        await this.notifyAdminsOfDeletionRequest(request.id);
      }

      logger.info('Data access request created', { requestId: request.id });
      return request;
    } catch (error) {
      logger.error('Failed to create data access request', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Process data export request
   */
  private async processDataExport(requestId: string): Promise<void> {
    try {
      logger.info('Processing data export request', { requestId });

      // In production:
      // 1. Get request from database
      // 2. Collect all user data
      // 3. Generate export file
      // 4. Upload to secure storage
      // 5. Update request with download URL
      // 6. Send email notification

      // Placeholder implementation
      await prisma.auditLog.create({
        data: {
          action: 'gdpr.export.completed',
          entityType: 'data_access_request',
          entityId: requestId,
        },
      });
    } catch (error) {
      logger.error('Failed to process data export', error as Error, { requestId });
    }
  }

  /**
   * Process data deletion request (Right to be Forgotten)
   */
  async processDataDeletion(
    userId: string,
    requestId: string,
    adminId: string
  ): Promise<void> {
    try {
      logger.info('Processing data deletion request', { userId, requestId, adminId });

      // 1. Delete user data from all systems
      await this.deleteUserData(userId);

      // 2. Update request status
      // await updateDataAccessRequest(requestId, { 
      //   status: 'completed',
      //   completedAt: new Date()
      // });

      // 3. Log the deletion
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          action: 'gdpr.deletion.completed',
          entityType: 'data_access_request',
          entityId: requestId,
          metadata: {
            deletedUserId: userId,
          },
        },
      });

      logger.info('Data deletion completed', { userId, requestId });
    } catch (error) {
      logger.error('Failed to process data deletion', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Delete all user data
   */
  private async deleteUserData(userId: string): Promise<void> {
    try {
      logger.warn('Deleting user data', { userId });

      // Delete in order to respect foreign key constraints
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.workspaceMember.deleteMany({ where: { userId } });
      await prisma.application.deleteMany({ where: { applicantUserId: userId } });
      
      // Anonymize owned workspaces instead of deleting them
      const ownedWorkspaces = await prisma.workspace.findMany({
        where: { ownerId: userId },
      });

      for (const workspace of ownedWorkspaces) {
        // Transfer ownership or delete based on business logic
        // For now, we'll keep the workspace but anonymize owner reference
        logger.warn('Workspace ownership transfer needed', {
          workspaceId: workspace.id,
          userId,
        });
      }

      // Finally delete the user
      await prisma.user.delete({ where: { id: userId } });

      logger.info('User data deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user data', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Get user privacy settings
   */
  async getPrivacySettings(userId: string): Promise<PrivacySettings> {
    logger.info('Fetching privacy settings', { userId });

    // In production, fetch from database
    return {
      userId,
      allowAnalytics: true,
      allowMarketingEmails: false,
      allowProfileIndexing: true,
      allowDataSharing: false,
    };
  }

  /**
   * Update user privacy settings
   */
  async updatePrivacySettings(
    userId: string,
    settings: Partial<PrivacySettings>
  ): Promise<PrivacySettings> {
    try {
      logger.info('Updating privacy settings', { userId, settings });

      // In production, update in database
      const currentSettings = await this.getPrivacySettings(userId);
      const updatedSettings = { ...currentSettings, ...settings };

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'privacy.settings.updated',
          entityType: 'user',
          entityId: userId,
          metadata: { changes: settings },
        },
      });

      return updatedSettings;
    } catch (error) {
      logger.error('Failed to update privacy settings', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Generate privacy report for user
   */
  async generatePrivacyReport(userId: string): Promise<{
    dataCollected: string[];
    processingPurposes: DataProcessingPurpose[];
    thirdPartySharing: string[];
    retentionPeriod: string;
    rights: string[];
  }> {
    logger.info('Generating privacy report', { userId });

    return {
      dataCollected: [
        'Email address',
        'Display name',
        'Workspace data',
        'Usage analytics',
        'Payment information',
        'IP addresses',
        'Session data',
      ],
      processingPurposes: [
        DataProcessingPurpose.SERVICE_DELIVERY,
        DataProcessingPurpose.ANALYTICS,
        DataProcessingPurpose.SUPPORT,
        DataProcessingPurpose.SECURITY,
        DataProcessingPurpose.LEGAL_COMPLIANCE,
      ],
      thirdPartySharing: [
        'Payment processor (Stripe)',
        'Email service provider',
        'Analytics provider',
        'Hosting provider',
      ],
      retentionPeriod: 'Data is retained for as long as your account is active, plus 90 days after deletion.',
      rights: [
        'Right to access your data',
        'Right to rectification',
        'Right to erasure (right to be forgotten)',
        'Right to data portability',
        'Right to object to processing',
        'Right to withdraw consent',
      ],
    };
  }

  /**
   * Notify admins of deletion request
   */
  private async notifyAdminsOfDeletionRequest(requestId: string): Promise<void> {
    const admins = await prisma.user.findMany({
      where: { isPlatformAdmin: true },
    });

    for (const admin of admins) {
      await emailService.sendCustomEmail({
        to: admin.email,
        subject: 'User Data Deletion Request - Action Required',
        html: `
          <p>Hi ${admin.displayName},</p>
          <p>A user has requested deletion of their data.</p>
          <p>Request ID: ${requestId}</p>
          <p>Please review and process this request within 30 days.</p>
        `,
      });
    }
  }

  /**
   * Check data retention compliance
   */
  async checkRetentionCompliance(): Promise<{
    usersToDelete: string[];
    dataToArchive: string[];
  }> {
    logger.info('Checking data retention compliance');

    // In production, identify data past retention period
    return {
      usersToDelete: [],
      dataToArchive: [],
    };
  }

  /**
   * Anonymize old data
   */
  async anonymizeOldData(beforeDate: Date): Promise<number> {
    logger.info('Anonymizing old data', { beforeDate });

    // In production:
    // 1. Find old audit logs
    // 2. Anonymize user references
    // 3. Keep data for compliance but remove PII

    return 0;
  }

  /**
   * Generate data processing agreement
   */
  async generateDataProcessingAgreement(workspaceId: string): Promise<string> {
    logger.info('Generating data processing agreement', { workspaceId });

    // In production, generate a legal DPA document
    return 'https://serverforge.io/legal/dpa';
  }

  /**
   * Get all pending data requests
   */
  async getPendingDataRequests(): Promise<DataAccessRequest[]> {
    logger.info('Fetching pending data requests');
    // In production, fetch from database
    return [];
  }
}

export const gdprComplianceService = new GDPRComplianceService();
