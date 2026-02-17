/**
 * Password Reset and Recovery System
 * Handles secure password reset flows
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { emailService, EmailTemplateType } from './email.js';
import bcrypt from 'bcryptjs';

export interface PasswordResetRequest {
  id: string;
  userId: string;
  token: string; // hashed
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordResetResult {
  success: boolean;
  error?: string;
}

class PasswordResetService {
  private readonly tokenLength = 32;
  private readonly tokenExpiryHours = 1;
  private readonly maxAttempts = 3;
  private readonly lockoutMinutes = 15;

  /**
   * Generate a secure password reset token
   */
  private generateToken(): { token: string; hash: string } {
    const token = crypto.randomBytes(this.tokenLength).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    
    return { token, hash };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(
    email: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordResetResult> {
    try {
      logger.info('Password reset requested', { email, ipAddress });

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
      });

      // Don't reveal if email exists or not (security)
      if (!user) {
        logger.warn('Password reset requested for non-existent email', { email });
        return { success: true }; // Still return success
      }

      // Check for recent reset requests (rate limiting)
      const recentRequests = await this.getRecentResetRequests(user.id, 60); // last hour
      if (recentRequests >= this.maxAttempts) {
        logger.warn('Too many password reset requests', { userId: user.id });
        return {
          success: false,
          error: 'Too many password reset requests. Please try again later.',
        };
      }

      // Generate token
      const { token, hash } = this.generateToken();
      const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);

      // In production, save reset request to database
      // await createPasswordResetRequest({
      //   userId: user.id,
      //   tokenHash: hash,
      //   expiresAt,
      //   ipAddress,
      //   userAgent,
      // });

      // Generate reset URL
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

      // Send reset email
      await emailService.sendTemplateEmail(
        user.email,
        EmailTemplateType.PASSWORD_RESET,
        {
          displayName: user.displayName,
          resetUrl,
          expiresIn: `${this.tokenExpiryHours} hour${this.tokenExpiryHours > 1 ? 's' : ''}`,
        }
      );

      // Log in audit
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'password.reset.requested',
          entityType: 'user',
          entityId: user.id,
          metadata: { ipAddress, userAgent },
        },
      });

      logger.info('Password reset email sent', { userId: user.id });

      return { success: true };
    } catch (error) {
      logger.error('Failed to process password reset request', error as Error, { email });
      return {
        success: false,
        error: 'Failed to process password reset request',
      };
    }
  }

  /**
   * Verify password reset token
   */
  async verifyResetToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    error?: string;
  }> {
    try {
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      // In production, fetch from database
      // const resetRequest = await getPasswordResetRequest(hash);

      // Placeholder validation
      return {
        valid: false,
        error: 'Invalid or expired reset token',
      };

      /*
      if (!resetRequest) {
        return { valid: false, error: 'Invalid reset token' };
      }

      if (resetRequest.used) {
        return { valid: false, error: 'Reset token already used' };
      }

      if (resetRequest.expiresAt < new Date()) {
        return { valid: false, error: 'Reset token expired' };
      }

      return { valid: true, userId: resetRequest.userId };
      */
    } catch (error) {
      logger.error('Failed to verify reset token', error as Error);
      return { valid: false, error: 'Token verification failed' };
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword(
    token: string,
    newPassword: string,
    ipAddress?: string
  ): Promise<PasswordResetResult> {
    try {
      logger.info('Password reset attempt', { ipAddress });

      // Verify token
      const verification = await this.verifyResetToken(token);
      if (!verification.valid || !verification.userId) {
        return {
          success: false,
          error: verification.error || 'Invalid token',
        };
      }

      // Validate new password
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return {
          success: false,
          error: passwordValidation.error,
        };
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update user password
      await prisma.user.update({
        where: { id: verification.userId },
        data: { passwordHash },
      });

      // Mark token as used
      // await markResetTokenUsed(tokenHash);

      // Invalidate all existing sessions for security
      // await invalidateUserSessions(verification.userId);

      // Log in audit
      await prisma.auditLog.create({
        data: {
          userId: verification.userId,
          action: 'password.reset.completed',
          entityType: 'user',
          entityId: verification.userId,
          metadata: { ipAddress },
        },
      });

      // Send confirmation email
      const user = await prisma.user.findUnique({
        where: { id: verification.userId },
      });

      if (user) {
        await emailService.sendCustomEmail({
          to: user.email,
          subject: 'Password Changed Successfully',
          html: `
            <p>Hi ${user.displayName},</p>
            <p>Your password has been successfully changed.</p>
            <p>If you did not make this change, please contact support immediately.</p>
          `,
        });
      }

      logger.info('Password reset completed', { userId: verification.userId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to reset password', error as Error);
      return {
        success: false,
        error: 'Failed to reset password',
      };
    }
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<PasswordResetResult> {
    try {
      logger.info('Password change attempt', { userId });

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.passwordHash) {
        return {
          success: false,
          error: 'User not found',
        };
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'password.change.failed',
            entityType: 'user',
            entityId: userId,
            metadata: { reason: 'invalid_current_password' },
          },
        });

        return {
          success: false,
          error: 'Current password is incorrect',
        };
      }

      // Validate new password
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return {
          success: false,
          error: passwordValidation.error,
        };
      }

      // Check if new password is same as old
      const isSame = await bcrypt.compare(newPassword, user.passwordHash);
      if (isSame) {
        return {
          success: false,
          error: 'New password must be different from current password',
        };
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Log in audit
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'password.changed',
          entityType: 'user',
          entityId: userId,
        },
      });

      // Send confirmation email
      await emailService.sendCustomEmail({
        to: user.email,
        subject: 'Password Changed Successfully',
        html: `
          <p>Hi ${user.displayName},</p>
          <p>Your password has been successfully changed.</p>
          <p>If you did not make this change, please contact support immediately.</p>
        `,
      });

      logger.info('Password changed successfully', { userId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to change password', error as Error, { userId });
      return {
        success: false,
        error: 'Failed to change password',
      };
    }
  }

  /**
   * Validate password strength
   */
  validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < 8) {
      return {
        valid: false,
        error: 'Password must be at least 8 characters long',
      };
    }

    if (password.length > 128) {
      return {
        valid: false,
        error: 'Password must be less than 128 characters',
      };
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one uppercase letter',
      };
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one lowercase letter',
      };
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one number',
      };
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return {
        valid: false,
        error: 'Password must contain at least one special character',
      };
    }

    return { valid: true };
  }

  /**
   * Get count of recent reset requests
   */
  private async getRecentResetRequests(userId: string, minutes: number): Promise<number> {
    // In production, query database for recent requests
    const since = new Date(Date.now() - minutes * 60 * 1000);

    // Placeholder
    return 0;
  }

  /**
   * Clean up expired reset tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    logger.info('Cleaning up expired password reset tokens');

    // In production:
    // 1. Find expired tokens
    // 2. Delete from database

    return 0;
  }
}

export const passwordResetService = new PasswordResetService();
