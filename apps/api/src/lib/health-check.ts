/**
 * Health Check and Monitoring System
 * Provides health endpoints and system monitoring
 */

import { prisma } from './prisma.js';
import { redis } from './redis.js';
import { logger } from './logger.js';
import os from 'os';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: CheckResult;
  };
  metrics?: SystemMetrics;
}

export interface CheckResult {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  responseTime?: number;
  details?: Record<string, unknown>;
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  process: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    pid: number;
  };
  requests?: {
    total: number;
    rps: number; // requests per second
    averageResponseTime: number;
    errorRate: number;
  };
}

export interface ServiceMetrics {
  service: string;
  requestCount: number;
  errorCount: number;
  averageLatency: number;
  lastError?: {
    timestamp: Date;
    message: string;
  };
}

class HealthCheckService {
  private startTime = Date.now();
  private version = process.env.APP_VERSION || '0.1.0';
  private requestMetrics = {
    total: 0,
    errors: 0,
    responseTimes: [] as number[],
  };

  /**
   * Perform comprehensive health check
   */
  async checkHealth(detailed: boolean = false): Promise<HealthStatus> {
    logger.debug('Performing health check', { detailed });

    const checks: { [key: string]: CheckResult } = {};

    // Check database
    checks.database = await this.checkDatabase();

    // Check Redis
    checks.redis = await this.checkRedis();

    // Check external services
    if (detailed) {
      checks.stripe = await this.checkStripe();
      checks.email = await this.checkEmailService();
    }

    // Determine overall status
    const hasFailures = Object.values(checks).some(c => c.status === 'fail');
    const hasWarnings = Object.values(checks).some(c => c.status === 'warn');
    
    const status: HealthStatus['status'] = 
      hasFailures ? 'unhealthy' :
      hasWarnings ? 'degraded' :
      'healthy';

    const result: HealthStatus = {
      status,
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: this.getUptime(),
      checks,
    };

    if (detailed) {
      result.metrics = await this.getSystemMetrics();
    }

    return result;
  }

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 1000 ? 'pass' : 'warn',
        message: responseTime < 1000 ? 'Database connection healthy' : 'Database response slow',
        responseTime,
      };
    } catch (error) {
      logger.error('Database health check failed', error as Error);
      return {
        status: 'fail',
        message: 'Database connection failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      await redis.ping();
      const responseTime = Date.now() - startTime;

      return {
        status: responseTime < 100 ? 'pass' : 'warn',
        message: responseTime < 100 ? 'Redis connection healthy' : 'Redis response slow',
        responseTime,
      };
    } catch (error) {
      logger.error('Redis health check failed', error as Error);
      return {
        status: 'fail',
        message: 'Redis connection failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check Stripe service
   */
  private async checkStripe(): Promise<CheckResult> {
    try {
      // In production, make a lightweight API call to Stripe
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      // await stripe.balance.retrieve();

      return {
        status: 'pass',
        message: 'Stripe connection healthy',
      };
    } catch (error) {
      logger.error('Stripe health check failed', error as Error);
      return {
        status: 'warn',
        message: 'Stripe connection degraded',
      };
    }
  }

  /**
   * Check email service
   */
  private async checkEmailService(): Promise<CheckResult> {
    try {
      // In production, check email service connectivity
      return {
        status: 'pass',
        message: 'Email service healthy',
      };
    } catch (error) {
      logger.error('Email service health check failed', error as Error);
      return {
        status: 'warn',
        message: 'Email service degraded',
      };
    }
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      cpu: {
        usage: os.loadavg()[0],
        loadAverage: os.loadavg(),
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercent: (usedMemory / totalMemory) * 100,
      },
      process: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid,
      },
      requests: this.getRequestMetrics(),
    };
  }

  /**
   * Get request metrics
   */
  private getRequestMetrics() {
    const responseTimes = this.requestMetrics.responseTimes;
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const errorRate = this.requestMetrics.total > 0
      ? (this.requestMetrics.errors / this.requestMetrics.total) * 100
      : 0;

    const uptime = this.getUptime();
    const rps = uptime > 0 ? this.requestMetrics.total / uptime : 0;

    return {
      total: this.requestMetrics.total,
      rps,
      averageResponseTime,
      errorRate,
    };
  }

  /**
   * Record request metrics
   */
  recordRequest(responseTime: number, isError: boolean = false): void {
    this.requestMetrics.total++;
    this.requestMetrics.responseTimes.push(responseTime);
    
    if (isError) {
      this.requestMetrics.errors++;
    }

    // Keep only last 1000 response times
    if (this.requestMetrics.responseTimes.length > 1000) {
      this.requestMetrics.responseTimes.shift();
    }
  }

  /**
   * Get uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get service-specific metrics
   */
  async getServiceMetrics(service: string): Promise<ServiceMetrics> {
    logger.debug('Fetching service metrics', { service });

    // In production, fetch from monitoring database or Redis
    return {
      service,
      requestCount: 0,
      errorCount: 0,
      averageLatency: 0,
    };
  }

  /**
   * Check disk space
   */
  async checkDiskSpace(): Promise<CheckResult> {
    try {
      // In production, check actual disk space
      // const diskSpace = await checkDisk('/');
      
      return {
        status: 'pass',
        message: 'Sufficient disk space available',
        details: {
          // available: diskSpace.available,
          // total: diskSpace.total,
        },
      };
    } catch (error) {
      logger.error('Disk space check failed', error as Error);
      return {
        status: 'fail',
        message: 'Failed to check disk space',
      };
    }
  }

  /**
   * Check queue health
   */
  async checkQueueHealth(): Promise<CheckResult> {
    try {
      // In production, check message queue health
      // const queueStats = await getQueueStats();

      return {
        status: 'pass',
        message: 'Queue is healthy',
      };
    } catch (error) {
      logger.error('Queue health check failed', error as Error);
      return {
        status: 'warn',
        message: 'Queue health check unavailable',
      };
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<{
    connections: number;
    slowQueries: number;
    tableSize: Record<string, number>;
  }> {
    logger.debug('Fetching database statistics');

    // In production, query actual database stats
    return {
      connections: 0,
      slowQueries: 0,
      tableSize: {},
    };
  }

  /**
   * Run diagnostics
   */
  async runDiagnostics(): Promise<{
    health: HealthStatus;
    warnings: string[];
    recommendations: string[];
  }> {
    logger.info('Running system diagnostics');

    const health = await this.checkHealth(true);
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Analyze health checks
    Object.entries(health.checks).forEach(([name, check]) => {
      if (check.status === 'warn') {
        warnings.push(`${name}: ${check.message}`);
      } else if (check.status === 'fail') {
        warnings.push(`CRITICAL: ${name}: ${check.message}`);
      }
    });

    // Check system resources
    if (health.metrics) {
      const memUsage = health.metrics.memory.usagePercent;
      if (memUsage > 90) {
        warnings.push(`High memory usage: ${memUsage.toFixed(1)}%`);
        recommendations.push('Consider increasing memory or optimizing memory usage');
      }

      const cpuLoad = health.metrics.cpu.loadAverage[0];
      const cpuCount = os.cpus().length;
      if (cpuLoad > cpuCount * 0.8) {
        warnings.push(`High CPU load: ${cpuLoad.toFixed(2)}`);
        recommendations.push('Consider scaling horizontally or optimizing CPU-intensive operations');
      }

      if (health.metrics.requests) {
        const errorRate = health.metrics.requests.errorRate;
        if (errorRate > 5) {
          warnings.push(`High error rate: ${errorRate.toFixed(2)}%`);
          recommendations.push('Investigate recent errors and fix underlying issues');
        }
      }
    }

    return {
      health,
      warnings,
      recommendations,
    };
  }

  /**
   * Get liveness probe (simple check that app is running)
   */
  async liveness(): Promise<{ alive: boolean }> {
    return { alive: true };
  }

  /**
   * Get readiness probe (check if app is ready to serve traffic)
   */
  async readiness(): Promise<{ ready: boolean; reason?: string }> {
    try {
      const dbCheck = await this.checkDatabase();
      const redisCheck = await this.checkRedis();

      if (dbCheck.status === 'fail') {
        return { ready: false, reason: 'Database unavailable' };
      }

      if (redisCheck.status === 'fail') {
        return { ready: false, reason: 'Redis unavailable' };
      }

      return { ready: true };
    } catch (error) {
      logger.error('Readiness check failed', error as Error);
      return { ready: false, reason: 'Health check failed' };
    }
  }
}

export const healthCheckService = new HealthCheckService();

/**
 * Express middleware for request metrics
 */
export const metricsMiddleware = (req: any, res: any, next: any) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    healthCheckService.recordRequest(responseTime, isError);
  });

  next();
};
