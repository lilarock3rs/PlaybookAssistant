import { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from './logger';
import { ApiResponse } from '../types';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, true);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service} service error: ${message}`, 502, true);
  }
}

export const handleError = (
  error: Error | AppError,
  req: VercelRequest,
  res: VercelResponse
): void => {
  let statusCode = 500;
  let message = 'Internal server error';
  let isOperational = false;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    isOperational = error.isOperational;
  }

  // Log error with context
  logger.error('API Error', error, {
    url: req.url,
    method: req.method,
    statusCode,
    isOperational,
    userAgent: req.headers['user-agent'],
    userId: req.headers['x-user-id'],
  });

  // Send error response
  const response: ApiResponse<null> = {
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  };

  res.status(statusCode).json(response);
};

export const asyncHandler = (
  fn: (req: VercelRequest, res: VercelResponse) => Promise<void>
) => {
  return (req: VercelRequest, res: VercelResponse) => {
    Promise.resolve(fn(req, res)).catch((error) => {
      handleError(error, req, res);
    });
  };
};

export const withErrorHandling = (
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) => {
  return asyncHandler(async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      } else {
        throw new AppError('Unknown error occurred');
      }
    }
  });
};

export const handleNotFound = (req: VercelRequest, res: VercelResponse): void => {
  const response: ApiResponse<null> = {
    success: false,
    error: `Route ${req.method} ${req.url} not found`,
  };
  
  res.status(404).json(response);
};

// Utility functions for common error scenarios
export const throwIfNotFound = <T>(item: T | null, message: string = 'Item not found'): T => {
  if (!item) {
    throw new NotFoundError(message);
  }
  return item;
};

export const throwIfUnauthorized = (condition: boolean, message?: string): void => {
  if (!condition) {
    throw new UnauthorizedError(message);
  }
};

export const throwIfInvalid = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new ValidationError(message);
  }
};