import { Request } from 'express';

type SecurityMetadata = Record<string, boolean | number | string | undefined>;

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
    method: req.method,
    path: req.path,
    ip: req.ip,
    ...metadata,
  }));
}
