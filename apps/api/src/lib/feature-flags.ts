/**
 * Feature Flags System
 * Dynamic feature toggles for gradual rollout and A/B testing
 */

import { redis } from './redis.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100
  targetUsers?: string[];
  targetWorkspaces?: string[];
  conditions?: FeatureFlagCondition[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface FeatureFlagCondition {
  type: 'user' | 'workspace' | 'plan' | 'custom';
  operator: 'equals' | 'contains' | 'in' | 'gt' | 'lt';
  value: unknown;
}

export enum FeatureFlagKey {
  // UI Features
  NEW_DASHBOARD = 'new_dashboard',
  ADVANCED_ANALYTICS = 'advanced_analytics',
  DARK_MODE = 'dark_mode',
  
  // API Features
  WEBHOOKS_V2 = 'webhooks_v2',
  API_V2 = 'api_v2',
  BULK_OPERATIONS = 'bulk_operations',
  
  // Business Features
  PREMIUM_FEATURES = 'premium_features',
  BETA_FEATURES = 'beta_features',
  AI_INSIGHTS = 'ai_insights',
  REAL_TIME_COLLABORATION = 'real_time_collaboration',
  
  // Infrastructure
  USE_CDN = 'use_cdn',
  ENABLE_CACHING = 'enable_caching',
  NEW_DATABASE = 'new_database',
}

class FeatureFlagService {
  private readonly cachePrefix = 'feature_flag:';
  private readonly cacheTTL = 300; // 5 minutes

  /**
   * Check if feature is enabled for user/workspace
   */
  async isEnabled(
    flagKey: FeatureFlagKey | string,
    context?: {
      userId?: string;
      workspaceId?: string;
      plan?: string;
    }
  ): Promise<boolean> {
    try {
      // Check cache first
      const cached = await this.getCachedFlag(flagKey);
      const flag = cached || await this.getFlag(flagKey);

      if (!flag) {
        logger.debug('Feature flag not found, defaulting to disabled', { flagKey });
        return false;
      }

      if (!flag.enabled) {
        return false;
      }

      // Check target users
      if (flag.targetUsers && flag.targetUsers.length > 0 && context?.userId) {
        if (!flag.targetUsers.includes(context.userId)) {
          return false;
        }
      }

      // Check target workspaces
      if (flag.targetWorkspaces && flag.targetWorkspaces.length > 0 && context?.workspaceId) {
        if (!flag.targetWorkspaces.includes(context.workspaceId)) {
          return false;
        }
      }

      // Check rollout percentage
      if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
        const hash = this.hashContext(flagKey, context);
        const bucket = hash % 100;
        if (bucket >= flag.rolloutPercentage) {
          return false;
        }
      }

      // Check conditions
      if (flag.conditions && flag.conditions.length > 0) {
        const conditionsMet = await this.evaluateConditions(flag.conditions, context);
        if (!conditionsMet) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Error checking feature flag', error as Error, { flagKey });
      return false; // Fail closed
    }
  }

  /**
   * Get feature flag
   */
  async getFlag(key: string): Promise<FeatureFlag | null> {
    try {
      // In production, fetch from database
      // For now, return default flags
      const defaultFlags = this.getDefaultFlags();
      return defaultFlags.find(f => f.key === key) || null;
    } catch (error) {
      logger.error('Error fetching feature flag', error as Error, { key });
      return null;
    }
  }

  /**
   * Create or update feature flag
   */
  async setFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): Promise<FeatureFlag> {
    try {
      logger.info('Setting feature flag', { key: flag.key, enabled: flag.enabled });

      const now = new Date();
      const fullFlag: FeatureFlag = {
        ...flag,
        createdAt: now,
        updatedAt: now,
      };

      // In production, save to database
      // await saveFeatureFlag(fullFlag);

      // Update cache
      await this.setCachedFlag(fullFlag);

      // Log change
      await prisma.auditLog.create({
        data: {
          userId: flag.createdBy,
          action: 'feature_flag.updated',
          entityType: 'feature_flag',
          entityId: flag.key,
          metadata: {
            enabled: flag.enabled,
            rolloutPercentage: flag.rolloutPercentage,
          },
        },
      });

      return fullFlag;
    } catch (error) {
      logger.error('Error setting feature flag', error as Error, { key: flag.key });
      throw error;
    }
  }

  /**
   * Enable feature flag
   */
  async enable(key: string, userId?: string): Promise<void> {
    const flag = await this.getFlag(key);
    if (flag) {
      await this.setFlag({
        ...flag,
        enabled: true,
        createdBy: userId,
      });
    }
  }

  /**
   * Disable feature flag
   */
  async disable(key: string, userId?: string): Promise<void> {
    const flag = await this.getFlag(key);
    if (flag) {
      await this.setFlag({
        ...flag,
        enabled: false,
        createdBy: userId,
      });
    }
  }

  /**
   * Set rollout percentage
   */
  async setRolloutPercentage(key: string, percentage: number): Promise<void> {
    const flag = await this.getFlag(key);
    if (flag) {
      await this.setFlag({
        ...flag,
        rolloutPercentage: Math.max(0, Math.min(100, percentage)),
      });
    }
  }

  /**
   * Add target users
   */
  async addTargetUsers(key: string, userIds: string[]): Promise<void> {
    const flag = await this.getFlag(key);
    if (flag) {
      const targetUsers = [...(flag.targetUsers || []), ...userIds];
      await this.setFlag({
        ...flag,
        targetUsers: Array.from(new Set(targetUsers)),
      });
    }
  }

  /**
   * Remove target users
   */
  async removeTargetUsers(key: string, userIds: string[]): Promise<void> {
    const flag = await this.getFlag(key);
    if (flag) {
      const targetUsers = (flag.targetUsers || []).filter(id => !userIds.includes(id));
      await this.setFlag({
        ...flag,
        targetUsers,
      });
    }
  }

  /**
   * List all feature flags
   */
  async listFlags(): Promise<FeatureFlag[]> {
    try {
      // In production, fetch from database
      return this.getDefaultFlags();
    } catch (error) {
      logger.error('Error listing feature flags', error as Error);
      return [];
    }
  }

  /**
   * Get enabled features for user/workspace
   */
  async getEnabledFeatures(context?: {
    userId?: string;
    workspaceId?: string;
    plan?: string;
  }): Promise<string[]> {
    const allFlags = await this.listFlags();
    const enabled: string[] = [];

    for (const flag of allFlags) {
      const isEnabled = await this.isEnabled(flag.key, context);
      if (isEnabled) {
        enabled.push(flag.key);
      }
    }

    return enabled;
  }

  /**
   * Evaluate conditions
   */
  private async evaluateConditions(
    conditions: FeatureFlagCondition[],
    context?: {
      userId?: string;
      workspaceId?: string;
      plan?: string;
    }
  ): Promise<boolean> {
    for (const condition of conditions) {
      const met = await this.evaluateCondition(condition, context);
      if (!met) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate single condition
   */
  private async evaluateCondition(
    condition: FeatureFlagCondition,
    context?: {
      userId?: string;
      workspaceId?: string;
      plan?: string;
    }
  ): Promise<boolean> {
    switch (condition.type) {
      case 'plan':
        if (!context?.plan) return false;
        return this.evaluateOperator(context.plan, condition.operator, condition.value);

      case 'user':
        if (!context?.userId) return false;
        return this.evaluateOperator(context.userId, condition.operator, condition.value);

      case 'workspace':
        if (!context?.workspaceId) return false;
        return this.evaluateOperator(context.workspaceId, condition.operator, condition.value);

      default:
        return true;
    }
  }

  /**
   * Evaluate operator
   */
  private evaluateOperator(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      
      case 'contains':
        return String(actual).includes(String(expected));
      
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      
      case 'gt':
        return Number(actual) > Number(expected);
      
      case 'lt':
        return Number(actual) < Number(expected);
      
      default:
        return false;
    }
  }

  /**
   * Hash context for consistent bucketing
   */
  private hashContext(
    flagKey: string,
    context?: {
      userId?: string;
      workspaceId?: string;
    }
  ): number {
    const str = `${flagKey}:${context?.userId || ''}:${context?.workspaceId || ''}`;
    let hash = 0;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash);
  }

  /**
   * Get cached flag
   */
  private async getCachedFlag(key: string): Promise<FeatureFlag | null> {
    try {
      const cached = await redis.get(`${this.cachePrefix}${key}`);
      if (cached) {
        const flag = JSON.parse(cached);
        flag.createdAt = new Date(flag.createdAt);
        flag.updatedAt = new Date(flag.updatedAt);
        return flag;
      }
    } catch (error) {
      logger.debug('Error getting cached flag', { key });
    }
    return null;
  }

  /**
   * Set cached flag
   */
  private async setCachedFlag(flag: FeatureFlag): Promise<void> {
    try {
      await redis.setex(
        `${this.cachePrefix}${flag.key}`,
        this.cacheTTL,
        JSON.stringify(flag)
      );
    } catch (error) {
      logger.debug('Error setting cached flag', { key: flag.key });
    }
  }

  /**
   * Clear cache
   */
  async clearCache(key?: string): Promise<void> {
    try {
      if (key) {
        await redis.del(`${this.cachePrefix}${key}`);
      } else {
        const keys = await redis.keys(`${this.cachePrefix}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error) {
      logger.error('Error clearing flag cache', error as Error);
    }
  }

  /**
   * Get default flags (for initialization)
   */
  private getDefaultFlags(): FeatureFlag[] {
    const now = new Date();
    
    return [
      {
        key: FeatureFlagKey.NEW_DASHBOARD,
        name: 'New Dashboard',
        description: 'Enable the redesigned dashboard interface',
        enabled: false,
        rolloutPercentage: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        key: FeatureFlagKey.ADVANCED_ANALYTICS,
        name: 'Advanced Analytics',
        description: 'Enable advanced analytics features',
        enabled: true,
        rolloutPercentage: 100,
        createdAt: now,
        updatedAt: now,
      },
      {
        key: FeatureFlagKey.WEBHOOKS_V2,
        name: 'Webhooks V2',
        description: 'Enable new webhook system with enhanced features',
        enabled: false,
        rolloutPercentage: 10,
        createdAt: now,
        updatedAt: now,
      },
      {
        key: FeatureFlagKey.PREMIUM_FEATURES,
        name: 'Premium Features',
        description: 'Enable premium-tier features',
        enabled: true,
        conditions: [
          {
            type: 'plan',
            operator: 'in',
            value: ['PRO', 'NETWORK'],
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        key: FeatureFlagKey.BETA_FEATURES,
        name: 'Beta Features',
        description: 'Enable beta features for testing',
        enabled: true,
        rolloutPercentage: 5,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }
}

/**
 * Express middleware for feature flag checks
 */
export const requireFeatureFlag = (flagKey: FeatureFlagKey | string) => {
  return async (req: any, res: any, next: any) => {
    try {
      const context = {
        userId: req.user?.id,
        workspaceId: req.workspace?.id,
        plan: req.workspace?.subscription?.plan,
      };

      const enabled = await featureFlagService.isEnabled(flagKey, context);

      if (!enabled) {
        return res.status(403).json({
          error: 'Feature not available',
          message: `Feature '${flagKey}' is not enabled for your account`,
        });
      }

      next();
    } catch (error) {
      logger.error('Feature flag middleware error', error as Error);
      return res.status(500).json({
        error: 'Feature flag check failed',
      });
    }
  };
};

export const featureFlagService = new FeatureFlagService();
