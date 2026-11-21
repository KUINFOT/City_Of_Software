import { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { logSecurityEvent } from './securityLog';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Browser-facing API headers. The API has no executable HTML, so a deny-all
 * CSP is both stricter and safer than allowing browser defaults. */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      baseUri: ["'none'"],
      defaultSrc: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: {
    includeSubDomains: true,
    maxAge: 31_536_000,
    preload: true,
  },
  xFrameOptions: false,
});

/** Sensitive API responses must never be retained by a browser or proxy. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

function rateLimitHandler(event: string) {
  return (req: Request, res: Response): void => {
    logSecurityEvent(event, req);
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
  };
}

/** Limits all state-changing API calls without throttling public reads. */
export const apiWriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => SAFE_METHODS.has(req.method),
  handler: rateLimitHandler('rate_limit.api_write'),
});

/** Limits unauthenticated flows most likely to be abused for guessing or spam. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => SAFE_METHODS.has(req.method),
  handler: rateLimitHandler('rate_limit.auth'),
});

/** A tighter additional cap for credential guessing. Account lockout remains
 * the user-level control; this is the complementary IP-level control. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: rateLimitHandler('rate_limit.login'),
});
