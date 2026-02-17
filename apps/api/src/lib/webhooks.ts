/**
 * Webhook management system
 * Allows workspaces to receive real-time notifications via webhooks
 */

import { logger } from './logger.js';
import axios from 'axios';
import crypto from 'crypto';

export enum WebhookEvent {
  // Workspace events
  WORKSPACE_CREATED = 'workspace.created',
  WORKSPACE_UPDATED = 'workspace.updated',
  WORKSPACE_DELETED = 'workspace.deleted',
  WORKSPACE_MEMBER_ADDED = 'workspace.member.added',
  WORKSPACE_MEMBER_REMOVED = 'workspace.member.removed',
  WORKSPACE_MEMBER_ROLE_CHANGED = 'workspace.member.role_changed',

  // Subscription events
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_UPDATED = 'subscription.updated',
  SUBSCRIPTION_CANCELLED = 'subscription.cancelled',
  SUBSCRIPTION_RENEWED = 'subscription.renewed',
  SUBSCRIPTION_TRIAL_ENDING = 'subscription.trial_ending',

  // Payment events
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
  INVOICE_CREATED = 'invoice.created',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',

  // Player events
  PLAYER_CREATED = 'player.created',
  PLAYER_UPDATED = 'player.updated',
  PLAYER_INCIDENT_CREATED = 'player.incident.created',
  PLAYER_REPUTATION_CHANGED = 'player.reputation.changed',
  PLAYER_WARNING_ISSUED = 'player.warning.issued',

  // Staff events
  APPLICATION_SUBMITTED = 'application.submitted',
  APPLICATION_ACCEPTED = 'application.accepted',
  APPLICATION_REJECTED = 'application.rejected',
  JOB_POST_CREATED = 'job_post.created',
  JOB_POST_CLOSED = 'job_post.closed',

  // Revenue events
  REVENUE_ENTRY_CREATED = 'revenue.entry.created',
  REVENUE_MILESTONE_REACHED = 'revenue.milestone.reached',

  // Security events
  SECURITY_ALERT = 'security.alert',
  SUSPICIOUS_LOGIN = 'security.suspicious_login',
  PASSWORD_CHANGED = 'security.password_changed',
  TWO_FACTOR_ENABLED = 'security.two_factor.enabled',
  TWO_FACTOR_DISABLED = 'security.two_factor.disabled',
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  workspaceId?: string;
  data: Record<string, unknown>;
  version: string;
}

export interface WebhookConfig {
  id: string;
  workspaceId: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  isActive: boolean;
  description?: string;
  headers?: Record<string, string>;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: WebhookPayload;
  attemptNumber: number;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  deliveredAt?: Date;
  nextRetryAt?: Date;
}

class WebhookService {
  private maxRetries = 5;
  private retryDelays = [60, 300, 900, 3600, 7200]; // seconds: 1min, 5min, 15min, 1hr, 2hr
  private timeout = 10000; // 10 seconds
  private version = '1.0';

  /**
   * Generate a secure webhook secret
   */
  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sign a webhook payload
   */
  private signPayload(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.signPayload(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Create a webhook payload
   */
  private createPayload(
    event: WebhookEvent,
    data: Record<string, unknown>,
    workspaceId?: string
  ): WebhookPayload {
    return {
      id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event,
      timestamp: new Date().toISOString(),
      workspaceId,
      data,
      version: this.version,
    };
  }

  /**
   * Deliver webhook to a single endpoint
   */
  private async deliverWebhook(
    config: WebhookConfig,
    payload: WebhookPayload,
    attemptNumber: number = 1
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: `whd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      webhookId: config.id,
      event: payload.event,
      payload,
      attemptNumber,
    };

    try {
      const payloadString = JSON.stringify(payload);
      const signature = this.signPayload(payloadString, config.secret);

      const headers = {
        'Content-Type': 'application/json',
        'X-ServerForge-Signature': signature,
        'X-ServerForge-Event': payload.event,
        'X-ServerForge-Delivery': delivery.id,
        'X-ServerForge-Timestamp': payload.timestamp,
        'User-Agent': 'ServerForge-Webhooks/1.0',
        ...config.headers,
      };

      logger.info('Delivering webhook', {
        webhookId: config.id,
        event: payload.event,
        url: config.url,
        attemptNumber,
      });

      const response = await axios.post(config.url, payloadString, {
        headers,
        timeout: this.timeout,
        validateStatus: () => true, // Don't throw on any status
      });

      delivery.statusCode = response.status;
      delivery.responseBody = JSON.stringify(response.data).substring(0, 1000);
      delivery.deliveredAt = new Date();

      if (response.status >= 200 && response.status < 300) {
        logger.info('Webhook delivered successfully', {
          webhookId: config.id,
          deliveryId: delivery.id,
          statusCode: response.status,
        });
      } else {
        logger.warn('Webhook delivery failed with non-2xx status', {
          webhookId: config.id,
          deliveryId: delivery.id,
          statusCode: response.status,
        });

        // Schedule retry if not max attempts
        if (attemptNumber < this.maxRetries) {
          const retryDelay = this.retryDelays[attemptNumber - 1] || this.retryDelays[this.retryDelays.length - 1];
          delivery.nextRetryAt = new Date(Date.now() + retryDelay * 1000);
        }
      }
    } catch (error) {
      const err = error as Error;
      delivery.error = err.message;

      logger.error('Webhook delivery failed', err, {
        webhookId: config.id,
        deliveryId: delivery.id,
        event: payload.event,
        attemptNumber,
      });

      // Schedule retry if not max attempts
      if (attemptNumber < this.maxRetries) {
        const retryDelay = this.retryDelays[attemptNumber - 1] || this.retryDelays[this.retryDelays.length - 1];
        delivery.nextRetryAt = new Date(Date.now() + retryDelay * 1000);
      }
    }

    // In a real app, store delivery in database
    return delivery;
  }

  /**
   * Send webhook to all configured endpoints for a workspace
   */
  async sendWebhook(
    workspaceId: string,
    event: WebhookEvent,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      // In a real app, fetch webhook configs from database
      const webhookConfigs: WebhookConfig[] = []; // await getWebhookConfigs(workspaceId, event);

      if (webhookConfigs.length === 0) {
        logger.debug('No webhook configs found', { workspaceId, event });
        return;
      }

      const payload = this.createPayload(event, data, workspaceId);

      // Deliver to all webhooks in parallel
      await Promise.allSettled(
        webhookConfigs.map(config => this.deliverWebhook(config, payload))
      );
    } catch (error) {
      logger.error('Failed to send webhooks', error as Error, {
        workspaceId,
        event,
      });
    }
  }

  /**
   * Retry failed webhook delivery
   */
  async retryWebhook(delivery: WebhookDelivery, config: WebhookConfig): Promise<void> {
    if (delivery.attemptNumber >= this.maxRetries) {
      logger.warn('Max retry attempts reached', {
        deliveryId: delivery.id,
        webhookId: config.id,
      });
      return;
    }

    await this.deliverWebhook(config, delivery.payload, delivery.attemptNumber + 1);
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(url: string, secret: string): Promise<{
    success: boolean;
    statusCode?: number;
    error?: string;
    latency?: number;
  }> {
    const startTime = Date.now();
    const testPayload = this.createPayload(
      WebhookEvent.WORKSPACE_CREATED,
      {
        test: true,
        message: 'This is a test webhook',
      }
    );

    try {
      const payloadString = JSON.stringify(testPayload);
      const signature = this.signPayload(payloadString, secret);

      const response = await axios.post(url, payloadString, {
        headers: {
          'Content-Type': 'application/json',
          'X-ServerForge-Signature': signature,
          'X-ServerForge-Event': testPayload.event,
          'X-ServerForge-Test': 'true',
          'User-Agent': 'ServerForge-Webhooks/1.0',
        },
        timeout: this.timeout,
        validateStatus: () => true,
      });

      const latency = Date.now() - startTime;

      return {
        success: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        latency,
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Get webhook delivery history
   */
  async getDeliveryHistory(
    webhookId: string,
    options: {
      page?: number;
      limit?: number;
      event?: WebhookEvent;
      status?: 'success' | 'failed' | 'pending';
    } = {}
  ): Promise<{
    deliveries: WebhookDelivery[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 50 } = options;

    logger.info('Fetching webhook delivery history', {
      webhookId,
      page,
      limit,
      ...options,
    });

    // In a real app, fetch from database
    return {
      deliveries: [],
      total: 0,
      page,
      limit,
    };
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(webhookId: string): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageLatency: number;
    successRate: number;
    lastDelivery?: Date;
    lastSuccessfulDelivery?: Date;
  }> {
    logger.info('Fetching webhook statistics', { webhookId });

    // In a real app, calculate from database
    return {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      averageLatency: 0,
      successRate: 0,
    };
  }

  /**
   * Helper methods for common webhook events
   */

  async notifyWorkspaceCreated(workspaceId: string, workspaceData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.WORKSPACE_CREATED, workspaceData);
  }

  async notifySubscriptionChanged(workspaceId: string, subscriptionData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.SUBSCRIPTION_UPDATED, subscriptionData);
  }

  async notifyPaymentSucceeded(workspaceId: string, paymentData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.PAYMENT_SUCCEEDED, paymentData);
  }

  async notifyPaymentFailed(workspaceId: string, paymentData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.PAYMENT_FAILED, paymentData);
  }

  async notifyPlayerIncident(workspaceId: string, incidentData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.PLAYER_INCIDENT_CREATED, incidentData);
  }

  async notifyApplicationSubmitted(workspaceId: string, applicationData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.APPLICATION_SUBMITTED, applicationData);
  }

  async notifyRevenueEntry(workspaceId: string, revenueData: Record<string, unknown>): Promise<void> {
    await this.sendWebhook(workspaceId, WebhookEvent.REVENUE_ENTRY_CREATED, revenueData);
  }

  async notifySecurityAlert(workspaceId: string | undefined, alertData: Record<string, unknown>): Promise<void> {
    if (workspaceId) {
      await this.sendWebhook(workspaceId, WebhookEvent.SECURITY_ALERT, alertData);
    }
  }
}

export const webhookService = new WebhookService();
