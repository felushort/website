/**
 * Comprehensive logging system for production environments
 * Supports multiple log levels, structured logging, and context tracking
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  workspaceId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
}

class Logger {
  private context: LogContext = {};
  private minLevel: LogLevel = LogLevel.INFO;

  constructor() {
    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel && Object.values(LogLevel).includes(envLevel as LogLevel)) {
      this.minLevel = envLevel as LogLevel;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  private formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context },
    };

    if (meta) {
      entry.metadata = meta;
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    // In production, you might send this to a logging service like CloudWatch, DataDog, etc.
    const logString = JSON.stringify(entry);

    switch (entry.level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(logString);
        break;
      case LogLevel.WARN:
        console.warn(logString);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(logString);
        break;
    }
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.context = { ...this.context, ...context };
    childLogger.minLevel = this.minLevel;
    return childLogger;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    const entry = this.formatLog(LogLevel.DEBUG, message, meta);
    this.output(entry);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    const entry = this.formatLog(LogLevel.INFO, message, meta);
    this.output(entry);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    const entry = this.formatLog(LogLevel.WARN, message, meta);
    this.output(entry);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const entry = this.formatLog(LogLevel.ERROR, message, meta);
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as Error & { code?: string }).code,
      };
    }

    this.output(entry);
  }

  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const entry = this.formatLog(LogLevel.FATAL, message, meta);
    
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as Error & { code?: string }).code,
      };
    }

    this.output(entry);
  }

  // Convenience methods for common logging scenarios
  logRequest(method: string, path: string, statusCode: number, duration: number): void {
    this.info('HTTP Request', {
      method,
      path,
      statusCode,
      duration,
    });
  }

  logDatabaseQuery(query: string, duration: number, error?: Error): void {
    if (error) {
      this.error('Database Query Failed', error, { query, duration });
    } else {
      this.debug('Database Query', { query, duration });
    }
  }

  logExternalApiCall(service: string, endpoint: string, statusCode?: number, error?: Error): void {
    if (error) {
      this.error(`External API Call Failed: ${service}`, error, { endpoint });
    } else {
      this.info('External API Call', { service, endpoint, statusCode });
    }
  }

  logSecurityEvent(event: string, details: Record<string, unknown>): void {
    this.warn('Security Event', { event, ...details });
  }

  logBusinessEvent(event: string, details: Record<string, unknown>): void {
    this.info('Business Event', { event, ...details });
  }
}

// Singleton instance
export const logger = new Logger();

// Express middleware for request logging
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Set request ID on request object
  req.requestId = requestId;
  
  // Create child logger with request context
  req.logger = logger.child({
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  // Log request start
  req.logger.info('Request started');

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    req.logger.logRequest(req.method, req.path, res.statusCode, duration);
  });

  next();
};
