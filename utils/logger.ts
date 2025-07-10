interface LogContext {
  userId?: string;
  channelId?: string;
  command?: string;
  action?: string;
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private isDevelopment: boolean;

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log('ERROR', message, { ...context, error: error?.message, stack: error?.stack });
  }

  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.log('DEBUG', message, context);
    }
  }

  private log(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    if (this.isDevelopment) {
      console.log(`[${timestamp}] ${level}: ${message}`, context || '');
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

export const logger = Logger.getInstance();