/**
 * API Key Management System
 * Allows workspaces to generate and manage API keys for programmatic access
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  key: string; // hashed
  prefix: string; // visible prefix for identification
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  permissions: ApiKeyPermission[];
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum ApiKeyPermission {
  // Read permissions
  READ_WORKSPACE = 'workspace:read',
  READ_MEMBERS = 'members:read',
  READ_SUBSCRIPTIONS = 'subscriptions:read',
  READ_REVENUE = 'revenue:read',
  READ_PLAYERS = 'players:read',
  READ_STAFF = 'staff:read',
  READ_ANALYTICS = 'analytics:read',

  // Write permissions
  WRITE_WORKSPACE = 'workspace:write',
  WRITE_MEMBERS = 'members:write',
  WRITE_REVENUE = 'revenue:write',
  WRITE_PLAYERS = 'players:write',
  WRITE_STAFF = 'staff:write',

  // Delete permissions
  DELETE_REVENUE = 'revenue:delete',
  DELETE_PLAYERS = 'players:delete',

  // Admin permissions
  ADMIN = 'admin',
}

export interface CreateApiKeyOptions {
  workspaceId: string;
  name: string;
  permissions: ApiKeyPermission[];
  expiresInDays?: number;
  createdById: string;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}

class ApiKeyService {
  private readonly keyPrefix = 'sfk_'; // ServerForge Key
  private readonly keyLength = 32;

  /**
   * Generate a new API key
   */
  private generateKey(): { key: string; hash: string; prefix: string } {
    const randomBytes = crypto.randomBytes(this.keyLength);
    const key = this.keyPrefix + randomBytes.toString('base64url');
    const hash = this.hashKey(key);
    const prefix = key.substring(0, 12); // First 12 chars for display

    return { key, hash, prefix };
  }

  /**
   * Hash an API key
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Create a new API key
   */
  async createApiKey(options: CreateApiKeyOptions): Promise<{ apiKey: ApiKey; rawKey: string }> {
    try {
      logger.info('Creating API key', {
        workspaceId: options.workspaceId,
        name: options.name,
        permissions: options.permissions,
      });

      const { key, hash, prefix } = this.generateKey();

      const expiresAt = options.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      // In a real app, store in database
      const apiKey: ApiKey = {
        id: `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: options.workspaceId,
        name: options.name,
        key: hash,
        prefix,
        isActive: true,
        permissions: options.permissions,
        expiresAt,
        createdById: options.createdById,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      logger.info('API key created', {
        keyId: apiKey.id,
        prefix: apiKey.prefix,
      });

      // Log in audit
      await prisma.auditLog.create({
        data: {
          workspaceId: options.workspaceId,
          userId: options.createdById,
          action: 'api_key.created',
          entityType: 'api_key',
          entityId: apiKey.id,
          metadata: {
            name: options.name,
            permissions: options.permissions,
            prefix,
          },
        },
      });

      // Return both the API key object and the raw key (only shown once)
      return {
        apiKey: {
          ...apiKey,
          key: '***', // Don't return the hash
        },
        rawKey: key,
      };
    } catch (error) {
      logger.error('Failed to create API key', error as Error, {
        workspaceId: options.workspaceId,
      });
      throw error;
    }
  }

  /**
   * Validate an API key
   */
  async validateApiKey(key: string): Promise<ApiKeyValidationResult> {
    try {
      if (!key.startsWith(this.keyPrefix)) {
        return {
          valid: false,
          error: 'Invalid API key format',
        };
      }

      const hash = this.hashKey(key);

      // In a real app, fetch from database
      // const apiKey = await getApiKeyByHash(hash);

      // For now, return invalid as we don't have database storage
      return {
        valid: false,
        error: 'API key not found',
      };

      // Real implementation would be:
      /*
      if (!apiKey) {
        return { valid: false, error: 'API key not found' };
      }

      if (!apiKey.isActive) {
        return { valid: false, error: 'API key is disabled' };
      }

      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Update last used timestamp
      await updateApiKeyLastUsed(apiKey.id);

      return { valid: true, apiKey };
      */
    } catch (error) {
      logger.error('Failed to validate API key', error as Error);
      return {
        valid: false,
        error: 'API key validation error',
      };
    }
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string, userId: string): Promise<void> {
    try {
      logger.info('Revoking API key', { keyId, userId });

      // In a real app, update in database
      // await updateApiKey(keyId, { isActive: false });

      // Log in audit
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'api_key.revoked',
          entityType: 'api_key',
          entityId: keyId,
        },
      });

      logger.info('API key revoked', { keyId });
    } catch (error) {
      logger.error('Failed to revoke API key', error as Error, { keyId });
      throw error;
    }
  }

  /**
   * Update API key
   */
  async updateApiKey(
    keyId: string,
    updates: {
      name?: string;
      permissions?: ApiKeyPermission[];
      isActive?: boolean;
    },
    userId: string
  ): Promise<void> {
    try {
      logger.info('Updating API key', { keyId, updates });

      // In a real app, update in database
      // await updateApiKey(keyId, updates);

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'api_key.updated',
          entityType: 'api_key',
          entityId: keyId,
          metadata: updates,
        },
      });

      logger.info('API key updated', { keyId });
    } catch (error) {
      logger.error('Failed to update API key', error as Error, { keyId });
      throw error;
    }
  }

  /**
   * List API keys for a workspace
   */
  async listApiKeys(workspaceId: string): Promise<ApiKey[]> {
    try {
      logger.info('Listing API keys', { workspaceId });

      // In a real app, fetch from database
      // return await getApiKeys(workspaceId);

      return [];
    } catch (error) {
      logger.error('Failed to list API keys', error as Error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get API key usage statistics
   */
  async getApiKeyStats(keyId: string): Promise<{
    totalRequests: number;
    requestsLast24h: number;
    requestsLast7d: number;
    requestsLast30d: number;
    lastUsedAt?: Date;
    averageResponseTime: number;
    errorRate: number;
  }> {
    logger.info('Fetching API key statistics', { keyId });

    // In a real app, calculate from request logs
    return {
      totalRequests: 0,
      requestsLast24h: 0,
      requestsLast7d: 0,
      requestsLast30d: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };
  }

  /**
   * Check if API key has permission
   */
  hasPermission(apiKey: ApiKey, permission: ApiKeyPermission): boolean {
    // Admin permission grants all permissions
    if (apiKey.permissions.includes(ApiKeyPermission.ADMIN)) {
      return true;
    }

    return apiKey.permissions.includes(permission);
  }

  /**
   * Rotate API key (create new key, revoke old one)
   */
  async rotateApiKey(keyId: string, userId: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    try {
      logger.info('Rotating API key', { keyId, userId });

      // In a real app:
      // 1. Get old key details
      // 2. Create new key with same settings
      // 3. Revoke old key
      // 4. Return new key

      throw new Error('Not implemented');
    } catch (error) {
      logger.error('Failed to rotate API key', error as Error, { keyId });
      throw error;
    }
  }

  /**
   * Generate temporary API key (short-lived)
   */
  async createTemporaryKey(
    workspaceId: string,
    permissions: ApiKeyPermission[],
    expiresInHours: number = 24,
    createdById: string
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    return await this.createApiKey({
      workspaceId,
      name: `Temporary Key - ${new Date().toISOString()}`,
      permissions,
      expiresInDays: expiresInHours / 24,
      createdById,
    });
  }
}

/**
 * Express middleware for API key authentication
 */
export const apiKeyAuth = async (req: any, res: any, next: any) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return res.status(401).json({
        error: 'No API key provided',
        message: 'Include API key in X-API-Key header or Authorization header',
      });
    }

    const validation = await apiKeyService.validateApiKey(apiKey as string);

    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: validation.error,
      });
    }

    // Attach API key to request
    req.apiKey = validation.apiKey;
    req.workspaceId = validation.apiKey?.workspaceId;

    next();
  } catch (error) {
    logger.error('API key authentication error', error as Error);
    return res.status(500).json({
      error: 'Authentication error',
    });
  }
};

/**
 * Middleware to check API key permission
 */
export const requirePermission = (permission: ApiKeyPermission) => {
  return (req: any, res: any, next: any) => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: 'Not authenticated',
      });
    }

    if (!apiKeyService.hasPermission(req.apiKey, permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
      });
    }

    next();
  };
};

export const apiKeyService = new ApiKeyService();
