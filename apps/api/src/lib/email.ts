/**
 * Email service for sending transactional emails
 * Supports multiple email templates and providers
 */

import { logger } from './logger.js';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export enum EmailTemplateType {
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password-reset',
  EMAIL_VERIFICATION = 'email-verification',
  WORKSPACE_INVITATION = 'workspace-invitation',
  SUBSCRIPTION_CREATED = 'subscription-created',
  SUBSCRIPTION_CANCELLED = 'subscription-cancelled',
  PAYMENT_FAILED = 'payment-failed',
  PAYMENT_SUCCESS = 'payment-success',
  TRIAL_ENDING = 'trial-ending',
  STAFF_APPLICATION_RECEIVED = 'staff-application-received',
  STAFF_APPLICATION_STATUS = 'staff-application-status',
  PLAYER_INCIDENT_REPORT = 'player-incident-report',
  AUDIT_ALERT = 'audit-alert',
  INVOICE_GENERATED = 'invoice-generated',
  USAGE_LIMIT_WARNING = 'usage-limit-warning',
  SECURITY_ALERT = 'security-alert',
}

interface TemplateData {
  [key: string]: unknown;
}

class EmailService {
  private defaultFrom = process.env.EMAIL_FROM || 'noreply@serverforge.io';
  private isProduction = process.env.NODE_ENV === 'production';

  private async sendEmail(options: EmailOptions): Promise<void> {
    try {
      logger.info('Sending email', {
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
      });

      // In production, integrate with services like SendGrid, AWS SES, Postmark, etc.
      if (this.isProduction) {
        // Example with SendGrid (would need to install @sendgrid/mail)
        // await sgMail.send({
        //   to: options.to,
        //   from: options.from || this.defaultFrom,
        //   subject: options.subject,
        //   html: options.html,
        //   text: options.text,
        // });
        logger.warn('Email would be sent in production', { options });
      } else {
        // In development, just log the email
        logger.debug('Email content (dev mode)', {
          to: options.to,
          subject: options.subject,
          html: options.html?.substring(0, 200),
        });
      }
    } catch (error) {
      logger.error('Failed to send email', error as Error, {
        to: options.to,
        subject: options.subject,
      });
      throw error;
    }
  }

  private generateTemplate(type: EmailTemplateType, data: TemplateData): EmailTemplate {
    const templates: Record<EmailTemplateType, (data: TemplateData) => EmailTemplate> = {
      [EmailTemplateType.WELCOME]: (data) => ({
        subject: 'Welcome to ServerForge!',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Welcome to ServerForge, ${data.displayName}!</h1>
              <p>We're excited to have you on board. ServerForge helps Minecraft server owners manage their operations efficiently.</p>
              <p>Your account is now active and you can start exploring all the features.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3>Quick Start Guide:</h3>
                <ul>
                  <li>Create your first workspace</li>
                  <li>Invite team members</li>
                  <li>Set up revenue tracking</li>
                  <li>Configure player management</li>
                </ul>
              </div>
              <p>If you have any questions, feel free to reach out to our support team.</p>
              <p>Best regards,<br/>The ServerForge Team</p>
            </body>
          </html>
        `,
        text: `Welcome to ServerForge, ${data.displayName}! We're excited to have you on board.`,
      }),

      [EmailTemplateType.PASSWORD_RESET]: (data) => ({
        subject: 'Reset Your ServerForge Password',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Password Reset Request</h1>
              <p>Hi ${data.displayName},</p>
              <p>We received a request to reset your password for your ServerForge account.</p>
              <p>Click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.resetUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
              </div>
              <p>This link will expire in ${data.expiresIn || '1 hour'}.</p>
              <p>If you didn't request this, you can safely ignore this email.</p>
              <p>For security, this password reset link can only be used once.</p>
            </body>
          </html>
        `,
        text: `Reset your password: ${data.resetUrl}`,
      }),

      [EmailTemplateType.EMAIL_VERIFICATION]: (data) => ({
        subject: 'Verify Your Email Address',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Verify Your Email</h1>
              <p>Hi ${data.displayName},</p>
              <p>Please verify your email address to complete your ServerForge registration.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.verificationUrl}" style="background: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #666;">${data.verificationUrl}</p>
            </body>
          </html>
        `,
        text: `Verify your email: ${data.verificationUrl}`,
      }),

      [EmailTemplateType.WORKSPACE_INVITATION]: (data) => ({
        subject: `You've been invited to join ${data.workspaceName} on ServerForge`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Workspace Invitation</h1>
              <p>Hi there,</p>
              <p>${data.inviterName} has invited you to join <strong>${data.workspaceName}</strong> on ServerForge.</p>
              <p>Role: <strong>${data.role}</strong></p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.invitationUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Accept Invitation</a>
              </div>
              <p>This invitation will expire in ${data.expiresIn || '7 days'}.</p>
            </body>
          </html>
        `,
        text: `You've been invited to join ${data.workspaceName}. Accept: ${data.invitationUrl}`,
      }),

      [EmailTemplateType.SUBSCRIPTION_CREATED]: (data) => ({
        subject: `Subscription Activated - ${data.planName}`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Subscription Activated</h1>
              <p>Hi ${data.displayName},</p>
              <p>Your <strong>${data.planName}</strong> subscription has been activated!</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Plan:</strong> ${data.planName}</p>
                <p><strong>Price:</strong> ${data.price}</p>
                <p><strong>Billing Cycle:</strong> ${data.billingCycle}</p>
                <p><strong>Next Billing Date:</strong> ${data.nextBillingDate}</p>
              </div>
              <p>Thank you for subscribing to ServerForge!</p>
            </body>
          </html>
        `,
        text: `Your ${data.planName} subscription has been activated!`,
      }),

      [EmailTemplateType.SUBSCRIPTION_CANCELLED]: (data) => ({
        subject: 'Subscription Cancelled',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Subscription Cancelled</h1>
              <p>Hi ${data.displayName},</p>
              <p>Your subscription has been cancelled as requested.</p>
              <p>You will continue to have access to your subscription features until: <strong>${data.accessUntil}</strong></p>
              <p>We're sorry to see you go. If you have feedback, we'd love to hear it.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.feedbackUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Share Feedback</a>
              </div>
            </body>
          </html>
        `,
        text: `Your subscription has been cancelled. Access until: ${data.accessUntil}`,
      }),

      [EmailTemplateType.PAYMENT_FAILED]: (data) => ({
        subject: 'Payment Failed - Action Required',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #dc3545;">Payment Failed</h1>
              <p>Hi ${data.displayName},</p>
              <p>We were unable to process your payment for <strong>${data.planName}</strong>.</p>
              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p><strong>Amount:</strong> ${data.amount}</p>
                <p><strong>Reason:</strong> ${data.reason}</p>
              </div>
              <p>Please update your payment method to avoid service interruption.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.updatePaymentUrl}" style="background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Update Payment Method</a>
              </div>
            </body>
          </html>
        `,
        text: `Payment failed for ${data.planName}. Please update your payment method: ${data.updatePaymentUrl}`,
      }),

      [EmailTemplateType.PAYMENT_SUCCESS]: (data) => ({
        subject: 'Payment Received - Thank You!',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #28a745;">Payment Received</h1>
              <p>Hi ${data.displayName},</p>
              <p>Thank you for your payment!</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Amount:</strong> ${data.amount}</p>
                <p><strong>Date:</strong> ${data.date}</p>
                <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
              </div>
              <p>Your invoice is attached to this email.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.invoiceUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Invoice</a>
              </div>
            </body>
          </html>
        `,
        text: `Payment received: ${data.amount}. Invoice: ${data.invoiceUrl}`,
      }),

      [EmailTemplateType.TRIAL_ENDING]: (data) => ({
        subject: `Your Trial Ends in ${data.daysRemaining} Days`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Your Trial is Ending Soon</h1>
              <p>Hi ${data.displayName},</p>
              <p>Your ServerForge trial period will end in <strong>${data.daysRemaining} days</strong>.</p>
              <p>Don't lose access to your data and features. Subscribe now to continue using ServerForge.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.subscribeUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Choose a Plan</a>
              </div>
              <p>If you have any questions, our team is here to help!</p>
            </body>
          </html>
        `,
        text: `Your trial ends in ${data.daysRemaining} days. Subscribe: ${data.subscribeUrl}`,
      }),

      [EmailTemplateType.STAFF_APPLICATION_RECEIVED]: (data) => ({
        subject: 'New Staff Application Received',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">New Staff Application</h1>
              <p>A new application has been received for <strong>${data.jobTitle}</strong>.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Applicant:</strong> ${data.applicantName || data.applicantTag}</p>
                <p><strong>Submitted:</strong> ${data.submittedAt}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.reviewUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Application</a>
              </div>
            </body>
          </html>
        `,
        text: `New staff application for ${data.jobTitle}. Review: ${data.reviewUrl}`,
      }),

      [EmailTemplateType.STAFF_APPLICATION_STATUS]: (data) => ({
        subject: `Staff Application Update - ${data.status}`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Application Status Update</h1>
              <p>Hi ${data.applicantName},</p>
              <p>Your application for <strong>${data.jobTitle}</strong> has been <strong>${data.status}</strong>.</p>
              ${data.message ? `<p>${data.message}</p>` : ''}
              ${data.nextStepsUrl ? `
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${data.nextStepsUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Next Steps</a>
                </div>
              ` : ''}
            </body>
          </html>
        `,
        text: `Your application for ${data.jobTitle} has been ${data.status}.`,
      }),

      [EmailTemplateType.PLAYER_INCIDENT_REPORT]: (data) => ({
        subject: `Player Incident Report - ${data.playerTag}`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Player Incident Report</h1>
              <p>A new incident has been reported for player <strong>${data.playerTag}</strong>.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Type:</strong> ${data.incidentType}</p>
                <p><strong>Severity:</strong> ${data.severity}</p>
                <p><strong>Details:</strong> ${data.details}</p>
                <p><strong>Reported By:</strong> ${data.reportedBy}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.viewUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Full Report</a>
              </div>
            </body>
          </html>
        `,
        text: `Player incident reported for ${data.playerTag}. Type: ${data.incidentType}`,
      }),

      [EmailTemplateType.AUDIT_ALERT]: (data) => ({
        subject: `Audit Alert: ${data.eventType}`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #dc3545;">Audit Alert</h1>
              <p>An important event has been detected in your workspace.</p>
              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p><strong>Event:</strong> ${data.eventType}</p>
                <p><strong>User:</strong> ${data.userName}</p>
                <p><strong>Time:</strong> ${data.timestamp}</p>
                <p><strong>Details:</strong> ${data.details}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.auditLogUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Audit Log</a>
              </div>
            </body>
          </html>
        `,
        text: `Audit alert: ${data.eventType} by ${data.userName} at ${data.timestamp}`,
      }),

      [EmailTemplateType.INVOICE_GENERATED]: (data) => ({
        subject: `Invoice ${data.invoiceNumber} - ${data.amount}`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333;">Invoice Ready</h1>
              <p>Hi ${data.displayName},</p>
              <p>Your invoice is ready for download.</p>
              <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
                <p><strong>Date:</strong> ${data.date}</p>
                <p><strong>Amount:</strong> ${data.amount}</p>
                <p><strong>Status:</strong> ${data.status}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.downloadUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Invoice</a>
              </div>
            </body>
          </html>
        `,
        text: `Invoice ${data.invoiceNumber} ready: ${data.downloadUrl}`,
      }),

      [EmailTemplateType.USAGE_LIMIT_WARNING]: (data) => ({
        subject: `Usage Limit Warning - ${data.limitType}`,
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #ffc107;">Usage Limit Warning</h1>
              <p>Hi ${data.displayName},</p>
              <p>You're approaching your ${data.limitType} limit.</p>
              <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                <p><strong>Current Usage:</strong> ${data.currentUsage}</p>
                <p><strong>Limit:</strong> ${data.limit}</p>
                <p><strong>Percentage Used:</strong> ${data.percentageUsed}%</p>
              </div>
              <p>Consider upgrading your plan to avoid service interruption.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.upgradeUrl}" style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Upgrade Plan</a>
              </div>
            </body>
          </html>
        `,
        text: `You're using ${data.percentageUsed}% of your ${data.limitType} limit. Upgrade: ${data.upgradeUrl}`,
      }),

      [EmailTemplateType.SECURITY_ALERT]: (data) => ({
        subject: 'Security Alert - Unusual Activity Detected',
        html: `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #dc3545;">Security Alert</h1>
              <p>Hi ${data.displayName},</p>
              <p>We detected unusual activity on your account.</p>
              <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
                <p><strong>Activity:</strong> ${data.activityType}</p>
                <p><strong>Location:</strong> ${data.location}</p>
                <p><strong>IP Address:</strong> ${data.ipAddress}</p>
                <p><strong>Time:</strong> ${data.timestamp}</p>
              </div>
              <p>If this was you, you can safely ignore this email. If not, please secure your account immediately.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.secureAccountUrl}" style="background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Secure My Account</a>
              </div>
            </body>
          </html>
        `,
        text: `Security alert: ${data.activityType} from ${data.location}. Secure your account: ${data.secureAccountUrl}`,
      }),
    };

    const templateFunction = templates[type];
    if (!templateFunction) {
      throw new Error(`Unknown email template type: ${type}`);
    }

    return templateFunction(data);
  }

  async sendTemplateEmail(
    to: string | string[],
    templateType: EmailTemplateType,
    data: TemplateData
  ): Promise<void> {
    const template = this.generateTemplate(templateType, data);
    await this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: this.defaultFrom,
    });
  }

  async sendCustomEmail(options: EmailOptions): Promise<void> {
    await this.sendEmail({
      ...options,
      from: options.from || this.defaultFrom,
    });
  }

  // Batch email sending
  async sendBatchEmails(emails: Array<{ to: string; templateType: EmailTemplateType; data: TemplateData }>): Promise<void> {
    const results = await Promise.allSettled(
      emails.map(email => this.sendTemplateEmail(email.to, email.templateType, email.data))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      logger.warn('Some emails failed to send', {
        total: emails.length,
        failed: failed.length,
      });
    }
  }
}

export const emailService = new EmailService();
