/**
 * Usage Tracking and Quota Management System
 * Monitors resource usage and enforces limits based on subscription plans
 */

import { redis } from './redis.js';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { notificationService, NotificationType, NotificationCategory } from './notifications.js';

export enum UsageMetric {
  API_REQUESTS = 'api_requests',
  STORAGE_BYTES = 'storage_bytes',
  WORKSPACES = 'workspaces',
  TEAM_MEMBERS = 'team_members',
  PLAYERS = 'players',
  REVENUE_ENTRIES = 'revenue_entries',
  JOB_POSTS = 'job_posts',
  WEBHOOKS = 'webhooks',
  EXPORTS = 'exports',
  EMAIL_SENDS = 'email_sends',
}

export interface UsageQuota {
  metric: UsageMetric;
  limit: number;
  period: 'hourly' | 'daily' | 'monthly' | 'total';
  softLimit?: number; // Warning threshold
}

export interface UsageRecord {
  workspaceId?: string;
  userId?: string;
  metric: UsageMetric;
  value: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface QuotaStatus {
  metric: UsageMetric;
  current: number;
  limit: number;
  percentage: number;
  exceeded: boolean;
  softLimitExceeded: boolean;
  resetsAt?: Date;
}

export interface PlanLimits {
  plan: string;
  quotas: UsageQuota[];
}

class UsageTrackingService {
  private readonly usagePrefix = 'usage:';
  private readonly quotaPrefix = 'quota:';

  /**
   * Plan-based quotas
   */
  private readonly planLimits: Record<string, PlanLimits> = {
    FREE: {
      plan: 'FREE',
      quotas: [
        { metric: UsageMetric.API_REQUESTS, limit: 1000, period: 'daily', softLimit: 900 },
        { metric: UsageMetric.STORAGE_BYTES, limit: 1024 * 1024 * 100, period: 'total' }, // 100MB
        { metric: UsageMetric.WORKSPACES, limit: 1, period: 'total' },
        { metric: UsageMetric.TEAM_MEMBERS, limit: 2, period: 'total' },
        { metric: UsageMetric.PLAYERS, limit: 100, period: 'total' },
        { metric: UsageMetric.REVENUE_ENTRIES, limit: 50, period: 'monthly' },
        { metric: UsageMetric.JOB_POSTS, limit: 2, period: 'total' },
        { metric: UsageMetric.WEBHOOKS, limit: 0, period: 'total' },
        { metric: UsageMetric.EXPORTS, limit: 5, period: 'monthly' },
        { metric: UsageMetric.EMAIL_SENDS, limit: 50, period: 'monthly' },
      ],
    },
    PRO: {
      plan: 'PRO',
      quotas: [
        { metric: UsageMetric.API_REQUESTS, limit: 10000, period: 'daily', softLimit: 9000 },
        { metric: UsageMetric.STORAGE_BYTES, limit: 1024 * 1024 * 1024 * 5, period: 'total' }, // 5GB
        { metric: UsageMetric.WORKSPACES, limit: 5, period: 'total' },
        { metric: UsageMetric.TEAM_MEMBERS, limit: 10, period: 'total' },
        { metric: UsageMetric.PLAYERS, limit: 1000, period: 'total' },
        { metric: UsageMetric.REVENUE_ENTRIES, limit: 500, period: 'monthly' },
        { metric: UsageMetric.JOB_POSTS, limit: 10, period: 'total' },
        { metric: UsageMetric.WEBHOOKS, limit: 5, period: 'total' },
        { metric: UsageMetric.EXPORTS, limit: 50, period: 'monthly' },
        { metric: UsageMetric.EMAIL_SENDS, limit: 500, period: 'monthly' },
      ],
    },
    NETWORK: {
      plan: 'NETWORK',
      quotas: [
        { metric: UsageMetric.API_REQUESTS, limit: 100000, period: 'daily', softLimit: 90000 },
        { metric: UsageMetric.STORAGE_BYTES, limit: 1024 * 1024 * 1024 * 50, period: 'total' }, // 50GB
        { metric: UsageMetric.WORKSPACES, limit: -1, period: 'total' }, // Unlimited
        { metric: UsageMetric.TEAM_MEMBERS, limit: -1, period: 'total' }, // Unlimited
        { metric: UsageMetric.PLAYERS, limit: -1, period: 'total' }, // Unlimited
        { metric: UsageMetric.REVENUE_ENTRIES, limit: -1, period: 'monthly' }, // Unlimited
        { metric: UsageMetric.JOB_POSTS, limit: -1, period: 'total' }, // Unlimited
        { metric: UsageMetric.WEBHOOKS, limit: 25, period: 'total' },
        { metric: UsageMetric.EXPORTS, limit: -1, period: 'monthly' }, // Unlimited
        { metric: UsageMetric.EMAIL_SENDS, limit: 5000, period: 'monthly' },
      ],
    },
  };

  /**
   * Track usage
   */
  async trackUsage(record: UsageRecord): Promise<void> {
    try {
      logger.debug('Tracking usage', {
        workspaceId: record.workspaceId,
        metric: record.metric,
        value: record.value,
      });

      // Store in time-series format
      const key = this.getUsageKey(record);
      await redis.incrby(key, record.value);

      // Set expiry based on period
      const quota = await this.getQuotaForMetric(record.workspaceId, record.metric);
      if (quota) {
        const ttl = this.getPeriodTTL(quota.period);
        await redis.expire(key, ttl);
      }

      // Check if soft limit or hard limit exceeded
      await this.checkQuotaStatus(record.workspaceId, record.metric);
    } catch (error) {
      logger.error('Failed to track usage', error as Error, {
        workspaceId: record.workspaceId,
        metric: record.metric,
      });
    }
  }

  /**
   * Get current usage
   */
  async getUsage(
    workspaceId: string | undefined,
    metric: UsageMetric,
    period?: 'hourly' | 'daily' | 'monthly'
  ): Promise<number> {
    try {
      const key = this.getUsageKey({
        workspaceId,
        metric,
        value: 0,
        timestamp: new Date(),
      });

      const usage = await redis.get(key);
      return usage ? parseInt(usage, 10) : 0;
    } catch (error) {
      logger.error('Failed to get usage', error as Error, {
        workspaceId,
        metric,
      });
      return 0;
    }
  }

  /**
   * Check quota status
   */
  async checkQuota(
    workspaceId: string | undefined,
    metric: UsageMetric
  ): Promise<QuotaStatus> {
    try {
      const quota = await this.getQuotaForMetric(workspaceId, metric);
      if (!quota) {
        return {
          metric,
          current: 0,
          limit: -1, // Unlimited
          percentage: 0,
          exceeded: false,
          softLimitExceeded: false,
        };
      }

      const current = await this.getUsage(workspaceId, metric, quota.period);
      const limit = quota.limit;
      const percentage = limit > 0 ? (current / limit) * 100 : 0;
      const exceeded = limit > 0 && current >= limit;
      const softLimitExceeded = quota.softLimit ? current >= quota.softLimit : false;

      return {
        metric,
        current,
        limit,
        percentage,
        exceeded,
        softLimitExceeded,
        resetsAt: this.getResetDate(quota.period),
      };
    } catch (error) {
      logger.error('Failed to check quota', error as Error, {
        workspaceId,
        metric,
      });
      throw error;
    }
  }

  /**
   * Check if quota is exceeded
   */
  async isQuotaExceeded(
    workspaceId: string | undefined,
    metric: UsageMetric
  ): Promise<boolean> {
    const status = await this.checkQuota(workspaceId, metric);
    return status.exceeded;
  }

  /**
   * Get all quota statuses for workspace
   */
  async getAllQuotaStatuses(workspaceId: string): Promise<QuotaStatus[]> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const planLimits = this.planLimits[plan];

    if (!planLimits) {
      return [];
    }

    const statuses: QuotaStatus[] = [];

    for (const quota of planLimits.quotas) {
      const status = await this.checkQuota(workspaceId, quota.metric);
      statuses.push(status);
    }

    return statuses;
  }

  /**
   * Check quota status and send notifications if needed
   */
  private async checkQuotaStatus(
    workspaceId: string | undefined,
    metric: UsageMetric
  ): Promise<void> {
    if (!workspaceId) return;

    const status = await this.checkQuota(workspaceId, metric);

    // Send notification if exceeded
    if (status.exceeded) {
      await this.notifyQuotaExceeded(workspaceId, status);
    } else if (status.softLimitExceeded) {
      await this.notifyQuotaWarning(workspaceId, status);
    }
  }

  /**
   * Notify when quota is exceeded
   */
  private async notifyQuotaExceeded(
    workspaceId: string,
    status: QuotaStatus
  ): Promise<void> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) return;

    await notificationService.notifyUsageLimit(
      workspace.ownerId,
      workspaceId,
      status.metric,
      100
    );

    logger.warn('Quota exceeded', {
      workspaceId,
      metric: status.metric,
      current: status.current,
      limit: status.limit,
    });
  }

  /**
   * Notify when approaching quota limit
   */
  private async notifyQuotaWarning(
    workspaceId: string,
    status: QuotaStatus
  ): Promise<void> {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) return;

    // Only send warning once per period
    const warningKey = `quota_warning:${workspaceId}:${status.metric}`;
    const alreadyWarned = await redis.get(warningKey);

    if (!alreadyWarned) {
      await notificationService.notifyUsageLimit(
        workspace.ownerId,
        workspaceId,
        status.metric,
        status.percentage
      );

      // Set warning flag with expiry
      await redis.setex(warningKey, 3600, '1'); // 1 hour

      logger.info('Quota warning sent', {
        workspaceId,
        metric: status.metric,
        percentage: status.percentage,
      });
    }
  }

  /**
   * Get quota for metric
   */
  private async getQuotaForMetric(
    workspaceId: string | undefined,
    metric: UsageMetric
  ): Promise<UsageQuota | null> {
    if (!workspaceId) return null;

    const plan = await this.getWorkspacePlan(workspaceId);
    const planLimits = this.planLimits[plan];

    if (!planLimits) return null;

    return planLimits.quotas.find(q => q.metric === metric) || null;
  }

  /**
   * Get workspace plan
   */
  private async getWorkspacePlan(workspaceId: string): Promise<string> {
    const subscription = await prisma.subscription.findUnique({
      where: { workspaceId },
    });

    return subscription?.plan || 'FREE';
  }

  /**
   * Get usage key for Redis
   */
  private getUsageKey(record: UsageRecord): string {
    const date = record.timestamp;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    const scope = record.workspaceId || record.userId || 'global';

    return `${this.usagePrefix}${scope}:${record.metric}:${year}-${month}-${day}-${hour}`;
  }

  /**
   * Get period TTL in seconds
   */
  private getPeriodTTL(period: UsageQuota['period']): number {
    switch (period) {
      case 'hourly':
        return 3600; // 1 hour
      case 'daily':
        return 86400; // 24 hours
      case 'monthly':
        return 2592000; // 30 days
      case 'total':
        return -1; // No expiry
      default:
        return 86400;
    }
  }

  /**
   * Get reset date for period
   */
  private getResetDate(period: UsageQuota['period']): Date | undefined {
    const now = new Date();

    switch (period) {
      case 'hourly':
        return new Date(now.getTime() + 3600000); // +1 hour
      case 'daily':
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth;
      case 'total':
        return undefined;
    }
  }

  /**
   * Reset usage for metric
   */
  async resetUsage(
    workspaceId: string,
    metric: UsageMetric
  ): Promise<void> {
    logger.info('Resetting usage', { workspaceId, metric });

    const pattern = `${this.usagePrefix}${workspaceId}:${metric}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Get usage history
   */
  async getUsageHistory(
    workspaceId: string,
    metric: UsageMetric,
    days: number = 30
  ): Promise<Array<{ date: string; value: number }>> {
    logger.info('Fetching usage history', { workspaceId, metric, days });

    const history: Array<{ date: string; value: number }> = [];

    // In production, aggregate from stored usage records
    // For now, return empty array

    return history;
  }

  /**
   * Get usage report
   */
  async getUsageReport(workspaceId: string): Promise<{
    period: { start: Date; end: Date };
    plan: string;
    quotas: QuotaStatus[];
    recommendations: string[];
  }> {
    const plan = await this.getWorkspacePlan(workspaceId);
    const quotas = await this.getAllQuotaStatuses(workspaceId);

    const recommendations: string[] = [];

    // Generate recommendations
    quotas.forEach(quota => {
      if (quota.exceeded) {
        recommendations.push(`${quota.metric}: Upgrade plan to increase limit`);
      } else if (quota.percentage > 80) {
        recommendations.push(`${quota.metric}: Consider upgrading soon (${quota.percentage.toFixed(0)}% used)`);
      }
    });

    return {
      period: {
        start: new Date(new Date().setDate(1)), // First of month
        end: new Date(),
      },
      plan,
      quotas,
      recommendations,
    };
  }
}

/**
 * Express middleware for quota enforcement
 */
export const enforceQuota = (metric: UsageMetric) => {
  return async (req: any, res: any, next: any) => {
    try {
      const workspaceId = req.workspace?.id;

      if (!workspaceId) {
        return next();
      }

      const exceeded = await usageTrackingService.isQuotaExceeded(workspaceId, metric);

      if (exceeded) {
        return res.status(429).json({
          error: 'Quota exceeded',
          message: `You have reached your ${metric} limit. Please upgrade your plan.`,
          metric,
        });
      }

      // Track usage after successful request
      res.on('finish', async () => {
        if (res.statusCode < 400) {
          await usageTrackingService.trackUsage({
            workspaceId,
            metric,
            value: 1,
            timestamp: new Date(),
          });
        }
      });

      next();
    } catch (error) {
      logger.error('Quota enforcement error', error as Error);
      next(); // Don't block on errors
    }
  };
};

export const usageTrackingService = new UsageTrackingService();
