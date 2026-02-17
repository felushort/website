/**
 * In-app notification system
 * Manages notifications for users across workspaces
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { emailService, EmailTemplateType } from './email.js';

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  URGENT = 'urgent',
}

export enum NotificationCategory {
  SYSTEM = 'system',
  WORKSPACE = 'workspace',
  SUBSCRIPTION = 'subscription',
  PAYMENT = 'payment',
  STAFF = 'staff',
  PLAYER = 'player',
  SECURITY = 'security',
  REVENUE = 'revenue',
}

export interface NotificationData {
  userId: string;
  workspaceId?: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
  emailTemplate?: EmailTemplateType;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  categories: {
    [key in NotificationCategory]?: {
      inApp: boolean;
      email: boolean;
    };
  };
}

class NotificationService {
  private defaultPreferences: NotificationPreferences['categories'] = {
    [NotificationCategory.SYSTEM]: { inApp: true, email: true },
    [NotificationCategory.WORKSPACE]: { inApp: true, email: true },
    [NotificationCategory.SUBSCRIPTION]: { inApp: true, email: true },
    [NotificationCategory.PAYMENT]: { inApp: true, email: true },
    [NotificationCategory.STAFF]: { inApp: true, email: false },
    [NotificationCategory.PLAYER]: { inApp: true, email: false },
    [NotificationCategory.SECURITY]: { inApp: true, email: true },
    [NotificationCategory.REVENUE]: { inApp: true, email: false },
  };

  /**
   * Create and send a notification to a user
   */
  async createNotification(data: NotificationData): Promise<void> {
    try {
      logger.info('Creating notification', {
        userId: data.userId,
        category: data.category,
        type: data.type,
      });

      // Get user preferences (in a real app, these would be stored in the database)
      const preferences = await this.getUserPreferences(data.userId);
      const categoryPref = preferences.categories[data.category] || this.defaultPreferences[data.category];

      // Create in-app notification if enabled
      if (categoryPref?.inApp) {
        // In a real app, store this in a Notification table
        logger.info('In-app notification created', {
          userId: data.userId,
          title: data.title,
        });
      }

      // Send email notification if enabled and requested
      if (data.sendEmail && categoryPref?.email && preferences.emailEnabled) {
        const user = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { email: true, displayName: true },
        });

        if (user && data.emailTemplate) {
          await emailService.sendTemplateEmail(
            user.email,
            data.emailTemplate,
            {
              displayName: user.displayName,
              ...data.metadata,
            }
          );
        }
      }

      // Log to audit log
      await this.createAuditEntry(data);
    } catch (error) {
      logger.error('Failed to create notification', error as Error, {
        userId: data.userId,
        category: data.category,
      });
    }
  }

  /**
   * Create notifications for multiple users
   */
  async createBulkNotifications(notifications: NotificationData[]): Promise<void> {
    await Promise.allSettled(
      notifications.map(notification => this.createNotification(notification))
    );
  }

  /**
   * Notify all workspace members
   */
  async notifyWorkspaceMembers(
    workspaceId: string,
    notification: Omit<NotificationData, 'userId' | 'workspaceId'>
  ): Promise<void> {
    try {
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: true },
      });

      const notifications = members.map(member => ({
        ...notification,
        userId: member.userId,
        workspaceId,
      }));

      await this.createBulkNotifications(notifications);
    } catch (error) {
      logger.error('Failed to notify workspace members', error as Error, {
        workspaceId,
      });
    }
  }

  /**
   * Notify platform admins
   */
  async notifyPlatformAdmins(notification: Omit<NotificationData, 'userId'>): Promise<void> {
    try {
      const admins = await prisma.user.findMany({
        where: { isPlatformAdmin: true },
        select: { id: true },
      });

      const notifications = admins.map(admin => ({
        ...notification,
        userId: admin.id,
      }));

      await this.createBulkNotifications(notifications);
    } catch (error) {
      logger.error('Failed to notify platform admins', error as Error);
    }
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    // In a real app, fetch from database
    // For now, return default preferences
    return {
      userId,
      emailEnabled: true,
      categories: this.defaultPreferences,
    };
  }

  /**
   * Create audit log entry for notification
   */
  private async createAuditEntry(data: NotificationData): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: data.workspaceId,
          userId: data.userId,
          action: 'notification.sent',
          entityType: 'notification',
          metadata: {
            type: data.type,
            category: data.category,
            title: data.title,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to create audit entry', error as Error);
    }
  }

  /**
   * Mark notification as read (placeholder for future implementation)
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    logger.info('Marking notification as read', { notificationId, userId });
    // Implementation would update notification status in database
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    logger.info('Marking all notifications as read', { userId });
    // Implementation would update all notifications for user
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    logger.info('Deleting notification', { notificationId, userId });
    // Implementation would delete notification from database
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    // Implementation would query database
    return 0;
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      category?: NotificationCategory;
    } = {}
  ): Promise<{
    notifications: unknown[];
    total: number;
    unread: number;
  }> {
    const { page = 1, limit = 20, unreadOnly = false, category } = options;

    logger.info('Fetching user notifications', {
      userId,
      page,
      limit,
      unreadOnly,
      category,
    });

    // Implementation would query database and return notifications
    return {
      notifications: [],
      total: 0,
      unread: 0,
    };
  }

  /**
   * Helper methods for common notification scenarios
   */

  async notifyNewWorkspaceMember(
    userId: string,
    workspaceId: string,
    workspaceName: string,
    role: string
  ): Promise<void> {
    await this.createNotification({
      userId,
      workspaceId,
      type: NotificationType.SUCCESS,
      category: NotificationCategory.WORKSPACE,
      title: 'Added to Workspace',
      message: `You have been added to ${workspaceName} as ${role}`,
      actionUrl: `/workspaces/${workspaceId}`,
      actionLabel: 'View Workspace',
    });
  }

  async notifySubscriptionChange(
    userId: string,
    workspaceId: string,
    planName: string,
    status: string
  ): Promise<void> {
    await this.createNotification({
      userId,
      workspaceId,
      type: NotificationType.INFO,
      category: NotificationCategory.SUBSCRIPTION,
      title: 'Subscription Updated',
      message: `Your ${planName} subscription is now ${status}`,
      actionUrl: `/workspaces/${workspaceId}/billing`,
      actionLabel: 'View Billing',
      sendEmail: true,
      emailTemplate: EmailTemplateType.SUBSCRIPTION_CREATED,
    });
  }

  async notifyPaymentFailed(
    userId: string,
    workspaceId: string,
    amount: string,
    reason: string
  ): Promise<void> {
    await this.createNotification({
      userId,
      workspaceId,
      type: NotificationType.ERROR,
      category: NotificationCategory.PAYMENT,
      title: 'Payment Failed',
      message: `Payment of ${amount} failed: ${reason}`,
      actionUrl: `/workspaces/${workspaceId}/billing`,
      actionLabel: 'Update Payment Method',
      sendEmail: true,
      emailTemplate: EmailTemplateType.PAYMENT_FAILED,
      metadata: { amount, reason },
    });
  }

  async notifyStaffApplication(
    workspaceId: string,
    jobTitle: string,
    applicantName: string
  ): Promise<void> {
    // Notify workspace admins and owners
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    await this.createBulkNotifications(
      members.map(member => ({
        userId: member.userId,
        workspaceId,
        type: NotificationType.INFO,
        category: NotificationCategory.STAFF,
        title: 'New Staff Application',
        message: `${applicantName} applied for ${jobTitle}`,
        actionUrl: `/workspaces/${workspaceId}/staff/applications`,
        actionLabel: 'Review Application',
        sendEmail: true,
        emailTemplate: EmailTemplateType.STAFF_APPLICATION_RECEIVED,
        metadata: { jobTitle, applicantName },
      }))
    );
  }

  async notifyPlayerIncident(
    workspaceId: string,
    playerTag: string,
    incidentType: string,
    severity: number
  ): Promise<void> {
    const type =
      severity >= 8 ? NotificationType.URGENT :
      severity >= 5 ? NotificationType.WARNING :
      NotificationType.INFO;

    await this.notifyWorkspaceMembers(workspaceId, {
      type,
      category: NotificationCategory.PLAYER,
      title: 'Player Incident Reported',
      message: `${incidentType} reported for player ${playerTag}`,
      actionUrl: `/workspaces/${workspaceId}/players`,
      actionLabel: 'View Details',
      metadata: { playerTag, incidentType, severity },
    });
  }

  async notifySecurityAlert(
    userId: string,
    alertType: string,
    details: string
  ): Promise<void> {
    await this.createNotification({
      userId,
      type: NotificationType.URGENT,
      category: NotificationCategory.SECURITY,
      title: 'Security Alert',
      message: `${alertType}: ${details}`,
      actionUrl: '/account/security',
      actionLabel: 'Review Security',
      sendEmail: true,
      emailTemplate: EmailTemplateType.SECURITY_ALERT,
      metadata: { alertType, details },
    });
  }

  async notifyTrialEnding(
    userId: string,
    workspaceId: string,
    daysRemaining: number
  ): Promise<void> {
    await this.createNotification({
      userId,
      workspaceId,
      type: NotificationType.WARNING,
      category: NotificationCategory.SUBSCRIPTION,
      title: 'Trial Ending Soon',
      message: `Your trial ends in ${daysRemaining} days`,
      actionUrl: `/workspaces/${workspaceId}/billing`,
      actionLabel: 'Subscribe Now',
      sendEmail: true,
      emailTemplate: EmailTemplateType.TRIAL_ENDING,
      metadata: { daysRemaining },
    });
  }

  async notifyUsageLimit(
    userId: string,
    workspaceId: string,
    limitType: string,
    percentageUsed: number
  ): Promise<void> {
    await this.createNotification({
      userId,
      workspaceId,
      type: NotificationType.WARNING,
      category: NotificationCategory.SYSTEM,
      title: 'Usage Limit Warning',
      message: `You've used ${percentageUsed}% of your ${limitType} limit`,
      actionUrl: `/workspaces/${workspaceId}/billing`,
      actionLabel: 'Upgrade Plan',
      sendEmail: true,
      emailTemplate: EmailTemplateType.USAGE_LIMIT_WARNING,
      metadata: { limitType, percentageUsed },
    });
  }
}

export const notificationService = new NotificationService();
