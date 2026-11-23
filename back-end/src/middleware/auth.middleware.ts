import { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { SessionModel } from '../models/Session';
import { readSessionToken, sessionIdleExpiresAt } from '../services/session.service';
import { logSecurityEvent } from './securityLog';

export type AuthenticatedRequest = Request & { authUser: { id: string; role: 'vendor' | 'reviewer' | 'admin'; name: string } };
type AuthUser = AuthenticatedRequest['authUser'];

function readBearerToken(header: string | undefined): string | null {
  if (!header || header.length <= 7 || header.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Validates the signed token, server-side idle session, and current account
 * state. A role/status change or logout therefore takes effect immediately.
 */
async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = readBearerToken(req.header('authorization'));
  const session = token ? readSessionToken(token) : null;
  if (!session) return null;

  const now = new Date();
  const activeSession = await SessionModel.findOneAndUpdate(
    { userId: { $eq: session.sub }, sessionId: { $eq: session.sid }, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { lastActivityAt: now, expiresAt: sessionIdleExpiresAt(now) } },
    { new: true }
  );
  if (!activeSession) return null;

  const user = await UserModel.findOne({ _id: { $eq: session.sub } }).select('name role status sessionVersion');
  if (!user || user.status !== 'active' || user.sessionVersion !== session.sv || !['vendor', 'reviewer', 'admin'].includes(user.role)) return null;
  return { id: user._id.toString(), name: user.name, role: user.role as AuthUser['role'] };
}

/** Checks an active signed-in user without imposing a role. */
export async function requireAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUser = await authenticate(req);
  if (!authUser) {
    logSecurityEvent('auth.authentication_failed', req);
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }
  (req as AuthenticatedRequest).authUser = authUser;
  next();
}

/** A vendor may only read or change their own profile; administrators may assist. */
export function requireSelfOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const { authUser } = req as AuthenticatedRequest;
  if (authUser.id !== req.params.userId && authUser.role !== 'admin') {
    logSecurityEvent('auth.authorization_denied', req, { actorId: authUser.id });
    res.status(403).json({ error: 'You do not have permission to access this vendor profile.' });
    return;
  }
  next();
}

/** Admin-role-gated routes (account/role management, etc). */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUser = await authenticate(req);
  if (!authUser) {
    logSecurityEvent('auth.authentication_failed', req);
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }
  if (authUser.role !== 'admin') {
    logSecurityEvent('auth.authorization_denied', req, { actorId: authUser.id });
    res.status(403).json({ error: 'Administrator access is required.' });
    return;
  }
  (req as AuthenticatedRequest).authUser = authUser;
  next();
}

/** Vendor-role-gated routes, including qualification matching. */
export async function requireVendor(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUser = await authenticate(req);
  if (!authUser) {
    logSecurityEvent('auth.authentication_failed', req);
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }
  if (authUser.role !== 'vendor') {
    logSecurityEvent('auth.authorization_denied', req, { actorId: authUser.id });
    res.status(403).json({ error: 'A vendor account is required.' });
    return;
  }
  (req as AuthenticatedRequest).authUser = authUser;
  next();
}
