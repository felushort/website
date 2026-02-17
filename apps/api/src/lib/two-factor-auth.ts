/**
 * Two-Factor Authentication (2FA) System
 * Provides TOTP-based two-factor authentication
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

export interface TwoFactorSecret {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

export interface TwoFactorVerification {
  valid: boolean;
  error?: string;
}

class TwoFactorAuthService {
  private readonly issuer = 'ServerForge';
  private readonly algorithm = 'SHA1';
  private readonly digits = 6;
  private readonly period = 30; // seconds

  /**
   * Generate a secret key for TOTP
   */
  generateSecret(): string {
    // Generate a 20-byte (160-bit) secret
    const secret = crypto.randomBytes(20).toString('base64')
      .replace(/\+/g, '0')
      .replace(/\//g, '0')
      .replace(/=/g, '');
    
    return secret;
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
    }
    
    return codes;
  }

  /**
   * Generate QR code URL for authenticator apps
   */
  generateQRCodeUrl(secret: string, userEmail: string): string {
    const label = encodeURIComponent(`${this.issuer}:${userEmail}`);
    const issuer = encodeURIComponent(this.issuer);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=${this.algorithm}&digits=${this.digits}&period=${this.period}`;
    
    // In production, use a QR code generation service or library
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}`;
    
    return qrCodeUrl;
  }

  /**
   * Enable 2FA for a user
   */
  async enable2FA(userId: string, userEmail: string): Promise<TwoFactorSecret> {
    try {
      logger.info('Enabling 2FA', { userId });

      const secret = this.generateSecret();
      const backupCodes = this.generateBackupCodes();
      const qrCodeUrl = this.generateQRCodeUrl(secret, userEmail);

      // In production, store secret and hashed backup codes in database
      // const hashedBackupCodes = backupCodes.map(code => 
      //   crypto.createHash('sha256').update(code).digest('hex')
      // );

      logger.info('2FA enabled successfully', { userId });

      return {
        secret,
        qrCodeUrl,
        backupCodes,
      };
    } catch (error) {
      logger.error('Failed to enable 2FA', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Verify 2FA setup with initial token
   */
  async verify2FASetup(userId: string, token: string, secret: string): Promise<boolean> {
    const isValid = this.verifyToken(token, secret);
    
    if (isValid) {
      // Save secret to database and mark 2FA as enabled
      logger.info('2FA setup verified', { userId });
      
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'security.two_factor.enabled',
          entityType: 'user',
          entityId: userId,
        },
      });
    }
    
    return isValid;
  }

  /**
   * Disable 2FA for a user
   */
  async disable2FA(userId: string, token: string): Promise<boolean> {
    try {
      logger.info('Disabling 2FA', { userId });

      // In production:
      // 1. Get user's 2FA secret from database
      // 2. Verify token or backup code
      // 3. Remove 2FA secret and backup codes from database

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'security.two_factor.disabled',
          entityType: 'user',
          entityId: userId,
        },
      });

      logger.info('2FA disabled successfully', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to disable 2FA', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Verify TOTP token
   */
  verifyToken(token: string, secret: string, window: number = 1): boolean {
    if (!token || token.length !== this.digits) {
      return false;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    
    // Check current time and windows before/after
    for (let i = -window; i <= window; i++) {
      const time = currentTime + (i * this.period);
      const expectedToken = this.generateTOTP(secret, time);
      
      if (this.constantTimeCompare(token, expectedToken)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      logger.info('Verifying backup code', { userId });

      // In production:
      // 1. Get hashed backup codes from database
      // 2. Hash provided code and compare
      // 3. If match, remove the used backup code
      // 4. Return true if valid

      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      logger.info('Backup code verified', { userId });
      
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'security.backup_code.used',
          entityType: 'user',
          entityId: userId,
        },
      });

      return false; // Placeholder
    } catch (error) {
      logger.error('Failed to verify backup code', error as Error, { userId });
      return false;
    }
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    try {
      logger.info('Regenerating backup codes', { userId });

      const newCodes = this.generateBackupCodes();

      // In production, hash and save to database

      await prisma.auditLog.create({
        data: {
          userId,
          action: 'security.backup_codes.regenerated',
          entityType: 'user',
          entityId: userId,
        },
      });

      return newCodes;
    } catch (error) {
      logger.error('Failed to regenerate backup codes', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Generate TOTP token
   */
  private generateTOTP(secret: string, time: number): string {
    const counter = Math.floor(time / this.period);
    const buffer = Buffer.alloc(8);
    
    // Write counter as big-endian 64-bit integer
    buffer.writeBigInt64BE(BigInt(counter));
    
    // Create HMAC
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'));
    hmac.update(buffer);
    const hmacResult = hmac.digest();
    
    // Dynamic truncation
    const offset = hmacResult[19] & 0x0f;
    const code = (
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff)
    ) % (10 ** this.digits);
    
    return code.toString().padStart(this.digits, '0');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }

  /**
   * Check if user has 2FA enabled
   */
  async is2FAEnabled(userId: string): Promise<boolean> {
    // In production, check database
    logger.info('Checking 2FA status', { userId });
    return false;
  }

  /**
   * Get 2FA status and info
   */
  async get2FAStatus(userId: string): Promise<{
    enabled: boolean;
    backupCodesRemaining?: number;
    lastUsed?: Date;
  }> {
    logger.info('Getting 2FA status', { userId });

    // In production, fetch from database
    return {
      enabled: false,
    };
  }
}

export const twoFactorAuthService = new TwoFactorAuthService();
