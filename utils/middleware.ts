import { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from './logger';
import { rateLimiter } from './rate-limiter';
import { UnauthorizedError, RateLimitError, ValidationError } from './error-handler';

// Slack request verification middleware
export const verifySlackRequest = (req: VercelRequest): void => {
  const slackSignature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const body = JSON.stringify(req.body);

  if (!slackSignature || !timestamp) {
    throw new UnauthorizedError('Missing Slack signature headers');
  }

  // Check if request is too old (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) { // 5 minutes
    throw new UnauthorizedError('Request timestamp too old');
  }

  // Verify signature
  const baseString = `v0:${timestamp}:${body}`;
  const computedSignature = 'v0=' + crypto
    .createHmac('sha256', config.slack.signingSecret)
    .update(baseString)
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(slackSignature),
    Buffer.from(computedSignature)
  );

  if (!isValid) {
    throw new UnauthorizedError('Invalid Slack signature');
  }
};

// Rate limiting middleware
export const withRateLimit = (
  limitType: string,
  getIdentifier: (req: VercelRequest) => string = (req) => req.ip || 'anonymous'
) => {
  return async (req: VercelRequest, res: VercelResponse, next: () => Promise<void>) => {
    try {
      const identifier = getIdentifier(req);
      const result = await rateLimiter.checkLimit(limitType, identifier);
      
      if (!result.allowed) {
        const resetIn = Math.ceil((result.resetTime - Date.now()) / 1000);
        throw new RateLimitError(`Rate limit exceeded. Try again in ${resetIn} seconds.`);
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Remaining', result.remainingRequests);
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
      
      await next();
    } catch (error) {
      throw error;
    }
  };
};

// CORS middleware for cross-origin requests
export const withCORS = (req: VercelRequest, res: VercelResponse, next: () => void) => {
  const allowedOrigins = [
    'https://api.slack.com',
    'https://hooks.slack.com',
    'https://slack.com',
  ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-ID');
  res.setHeader('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
};

// Request logging middleware
export const withRequestLogging = (req: VercelRequest, res: VercelResponse, next: () => void) => {
  const startTime = Date.now();
  
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    contentLength: req.headers['content-length'],
    userId: req.headers['x-user-id'],
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userId: req.headers['x-user-id'],
    });

    originalEnd.apply(this, args);
  };

  next();
};

// Content type validation middleware
export const requireJSON = (req: VercelRequest): void => {
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      throw new ValidationError('Content-Type must be application/json');
    }
  }
};

// Environment validation middleware
export const validateEnvironment = (): void => {
  const required = [
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'GOOGLE_API_KEY',
    'CLICKUP_API_KEY',
    'DATABASE_URL',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// API key validation for admin endpoints
export const requireApiKey = (req: VercelRequest): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKey = process.env.ADMIN_API_KEY;

  if (!validApiKey) {
    throw new Error('Admin API key not configured');
  }

  if (!apiKey || apiKey !== validApiKey) {
    throw new UnauthorizedError('Invalid or missing API key');
  }
};

// User context middleware
export const withUserContext = (req: VercelRequest, res: VercelResponse, next: () => void) => {
  // Extract user ID from various sources
  let userId = req.headers['x-user-id'] as string;
  
  if (!userId && req.body) {
    // Try to extract from Slack payload
    if (req.body.user_id) {
      userId = req.body.user_id;
    } else if (req.body.user?.id) {
      userId = req.body.user.id;
    }
  }

  if (userId) {
    req.headers['x-user-id'] = userId;
  }

  next();
};

// Health check middleware
export const healthCheck = (req: VercelRequest, res: VercelResponse): void => {
  if (req.url === '/health' || req.url === '/api/health') {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    });
    return;
  }
};

// Compose multiple middleware functions
export const compose = (...middlewares: Array<(req: VercelRequest, res: VercelResponse, next: () => void) => void>) => {
  return (req: VercelRequest, res: VercelResponse, finalHandler: () => Promise<void>) => {
    let index = 0;
    
    const next = () => {
      if (index >= middlewares.length) {
        return finalHandler();
      }
      
      const middleware = middlewares[index++];
      return middleware(req, res, next);
    };
    
    return next();
  };
};