/**
 * Session Management System
 * Handles user sessions, device tracking, and session security
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import { redis } from './redis.js';
import { prisma } from './prisma.js';

export interface Session {
  id: string;
  userId: string;
  token: string; // hashed
  refreshToken?: string; // hashed
  deviceId: string;
  deviceName?: string;
  ipAddress: string;
  userAgent: string;
  location?: {
    country?: string;
    city?: string;
  };
  isActive: boolean;
  lastActivityAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateSessionOptions {
  userId: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress: string;
  userAgent: string;
  rememberMe?: boolean;
}

export interface SessionValidation {
  valid: boolean;
  session?: Session;
  error?: string;
}

class SessionManagementService {
  private readonly sessionExpiryHours = 24;
  private readonly refreshTokenExpiryDays = 30;
  private readonly maxSessionsPerUser = 10;
  private readonly redisPrefix = 'session:';

  /**
   * Generate session tokens
   */
  private generateTokens(): {
    sessionToken: string;
    sessionHash: string;
    refreshToken: string;
    refreshHash: string;
  } {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    return { sessionToken, sessionHash, refreshToken, refreshHash };
  }

  /**
   * Generate device ID
   */
  private generateDeviceId(userAgent: string, ipAddress: string): string {
    const data = `${userAgent}:${ipAddress}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Create a new session
   */
  async createSession(options: CreateSessionOptions): Promise<{
    session: Session;
    sessionToken: string;
    refreshToken: string;
  }> {
    try {
      logger.info('Creating new session', { userId: options.userId, ipAddress: options.ipAddress });

      const { sessionToken, sessionHash, refreshToken, refreshHash } = this.generateTokens();
      
      const deviceId = options.deviceId || this.generateDeviceId(options.userAgent, options.ipAddress);
      
      const expiryHours = options.rememberMe ? this.refreshTokenExpiryDays * 24 : this.sessionExpiryHours;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      const session: Session = {
        id: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: options.userId,
        token: sessionHash,
        refreshToken: refreshHash,
        deviceId,
        deviceName: options.deviceName || this.parseDeviceName(options.userAgent),
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        isActive: true,
        lastActivityAt: new Date(),
        expiresAt,
        createdAt: new Date(),
      };

      // Store in Redis for fast lookup
      await this.storeSessionInRedis(session);

      // Check session limit
      await this.enforceSessionLimit(options.userId);

      // Log in audit
      await prisma.auditLog.create({
        data: {
          userId: options.userId,
          action: 'session.created',
          entityType: 'session',
          entityId: session.id,
          metadata: {
            deviceId,
            deviceName: session.deviceName,
            ipAddress: options.ipAddress,
          },
        },
      });

      logger.info('Session created', { sessionId: session.id, userId: options.userId });

      return { session, sessionToken, refreshToken };
    } catch (error) {
      logger.error('Failed to create session', error as Error, { userId: options.userId });
      throw error;
    }
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<SessionValidation> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // Check Redis first (fast path)
      const session = await this.getSessionFromRedis(tokenHash);
      
      if (!session) {
        return {
          valid: false,
          error: 'Session not found',
        };
      }

      if (!session.isActive) {
        return {
          valid: false,
          error: 'Session is inactive',
        };
      }

      if (session.expiresAt < new Date()) {
        await this.revokeSession(session.id);
        return {
          valid: false,
          error: 'Session expired',
        };
      }

      // Update last activity
      session.lastActivityAt = new Date();
      await this.storeSessionInRedis(session);

      return { valid: true, session };
    } catch (error) {
      logger.error('Failed to validate session', error as Error);
      return {
        valid: false,
        error: 'Session validation error',
      };
    }
  }

  /**
   * Refresh session using refresh token
   */
  async refreshSession(refreshToken: string): Promise<{
    session: Session;
    sessionToken: string;
    refreshToken: string;
  } | null> {
    try {
      const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      
      // Find session by refresh token
      const sessions = await this.getAllUserSessions(''); // Would need userId
      const session = sessions.find(s => s.refreshToken === refreshHash);

      if (!session || !session.isActive || session.expiresAt < new Date()) {
        return null;
      }

      // Create new session with same device info
      return await this.createSession({
        userId: session.userId,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      });
    } catch (error) {
      logger.error('Failed to refresh session', error as Error);
      return null;
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    try {
      logger.info('Revoking session', { sessionId });

      // Get session from Redis
      const sessions = await this.getAllSessionsFromRedis();
      const session = sessions.find(s => s.id === sessionId);

      if (session) {
        // Mark as inactive
        session.isActive = false;
        await this.storeSessionInRedis(session);

        // Log in audit
        await prisma.auditLog.create({
          data: {
            userId: session.userId,
            action: 'session.revoked',
            entityType: 'session',
            entityId: sessionId,
          },
        });
      }

      logger.info('Session revoked', { sessionId });
    } catch (error) {
      logger.error('Failed to revoke session', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    try {
      logger.info('Revoking all user sessions', { userId, exceptSessionId });

      const sessions = await this.getAllUserSessions(userId);
      let revokedCount = 0;

      for (const session of sessions) {
        if (session.id !== exceptSessionId) {
          await this.revokeSession(session.id);
          revokedCount++;
        }
      }

      logger.info('User sessions revoked', { userId, count: revokedCount });
      return revokedCount;
    } catch (error) {
      logger.error('Failed to revoke user sessions', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Get all sessions for a user
   */
  async getAllUserSessions(userId: string): Promise<Session[]> {
    try {
      const allSessions = await this.getAllSessionsFromRedis();
      return allSessions.filter(s => s.userId === userId && s.isActive);
    } catch (error) {
      logger.error('Failed to get user sessions', error as Error, { userId });
      return [];
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    try {
      const sessions = await this.getAllSessionsFromRedis();
      return sessions.find(s => s.id === sessionId) || null;
    } catch (error) {
      logger.error('Failed to get session', error as Error, { sessionId });
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (session) {
        session.lastActivityAt = new Date();
        await this.storeSessionInRedis(session);
      }
    } catch (error) {
      logger.error('Failed to update session activity', error as Error, { sessionId });
    }
  }

  /**
   * Enforce session limit per user
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getAllUserSessions(userId);
    
    if (sessions.length > this.maxSessionsPerUser) {
      // Sort by last activity and revoke oldest
      sessions.sort((a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime());
      
      const toRevoke = sessions.slice(0, sessions.length - this.maxSessionsPerUser);
      for (const session of toRevoke) {
        await this.revokeSession(session.id);
      }
      
      logger.warn('Session limit enforced', { 
        userId, 
        revoked: toRevoke.length 
      });
    }
  }

  /**
   * Store session in Redis
   */
  private async storeSessionInRedis(session: Session): Promise<void> {
    const key = `${this.redisPrefix}${session.token}`;
    const expirySeconds = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    
    await redis.setex(key, expirySeconds, JSON.stringify(session));
  }

  /**
   * Get session from Redis
   */
  private async getSessionFromRedis(tokenHash: string): Promise<Session | null> {
    const key = `${this.redisPrefix}${tokenHash}`;
    const data = await redis.get(key);
    
    if (!data) {
      return null;
    }

    const session = JSON.parse(data);
    // Convert date strings back to Date objects
    session.lastActivityAt = new Date(session.lastActivityAt);
    session.expiresAt = new Date(session.expiresAt);
    session.createdAt = new Date(session.createdAt);
    
    return session;
  }

  /**
   * Get all sessions from Redis
   */
  private async getAllSessionsFromRedis(): Promise<Session[]> {
    const pattern = `${this.redisPrefix}*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length === 0) {
      return [];
    }

    const sessions: Session[] = [];
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const session = JSON.parse(data);
        session.lastActivityAt = new Date(session.lastActivityAt);
        session.expiresAt = new Date(session.expiresAt);
        session.createdAt = new Date(session.createdAt);
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Parse device name from user agent
   */
  private parseDeviceName(userAgent: string): string {
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) return 'Android Device';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Macintosh')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux PC';
    return 'Unknown Device';
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    logger.info('Cleaning up expired sessions');

    try {
      const sessions = await this.getAllSessionsFromRedis();
      let cleanedCount = 0;

      for (const session of sessions) {
        if (session.expiresAt < new Date()) {
          await this.revokeSession(session.id);
          cleanedCount++;
        }
      }

      logger.info('Expired sessions cleaned up', { count: cleanedCount });
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', error as Error);
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    deviceCount: number;
    lastActivity?: Date;
  }> {
    const sessions = await this.getAllUserSessions(userId);
    const activeSessions = sessions.filter(s => s.isActive).length;
    const devices = new Set(sessions.map(s => s.deviceId));
    const lastActivity = sessions.length > 0
      ? sessions.reduce((latest, s) => 
          s.lastActivityAt > latest ? s.lastActivityAt : latest, 
          sessions[0].lastActivityAt
        )
      : undefined;

    return {
      totalSessions: sessions.length,
      activeSessions,
      deviceCount: devices.size,
      lastActivity,
    };
  }
}

export const sessionManagementService = new SessionManagementService();
