import { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

type SecurityMetadata = Record<string, boolean | number | string | undefined>;

/** Correlates the API response and all security events for one request. */
export function assignRequestId(_req: Request, res: Response, next: NextFunction): void {
  const requestId = randomBytes(16).toString('hex');
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Emits machine-readable security events without logging request bodies,
 * query strings, credentials, or bearer tokens. A log collector can index
 * these JSON lines without needing to parse a human-formatted message.
 */
export function logSecurityEvent(event: string, req: Request, metadata: SecurityMetadata = {}): void {
  console.info(JSON.stringify({
    level: 'security',
    event,
    timestamp: new Date().toISOString(),
    requestId: req.res?.locals.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    ...metadata,
  }));
}
