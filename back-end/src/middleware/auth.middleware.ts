import { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { SessionModel } from '../models/Session';
import { readSessionToken, sessionIdleExpiresAt } from '../services/session.service';

export type AuthenticatedRequest = Request & { authUser: { id: string; role: 'vendor' | 'reviewer' | 'admin'; name: string } };
type AuthUser = AuthenticatedRequest['authUser'];

/**
 * Validates the signed token, server-side idle session, and current account
 * state. A role/status change or logout therefore takes effect immediately.
 */
async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? readSessionToken(token) : null;
  if (!session) return null;

  const now = new Date();
  const activeSession = await SessionModel.findOneAndUpdate(
    { userId: session.sub, sessionId: session.sid, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { lastActivityAt: now, expiresAt: sessionIdleExpiresAt(now) } },
    { new: true }
  );
  if (!activeSession) return null;

  const user = await UserModel.findById(session.sub).select('name role status sessionVersion');
  if (!user || user.status !== 'active' || user.sessionVersion !== session.sv || !['vendor', 'reviewer', 'admin'].includes(user.role)) return null;
  return { id: user._id.toString(), name: user.name, role: user.role as AuthUser['role'] };
}

/** Checks an active signed-in user without imposing a role. */
export async function requireAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUser = await authenticate(req);
  if (!authUser) {
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
    res.status(403).json({ error: 'You do not have permission to access this vendor profile.' });
    return;
  }
  next();
}

/** Admin-role-gated routes (account/role management, etc). */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authUser = await authenticate(req);
  if (!authUser) {
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }
  if (authUser.role !== 'admin') {
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
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }
  if (authUser.role !== 'vendor') {
    res.status(403).json({ error: 'A vendor account is required.' });
    return;
  }
  (req as AuthenticatedRequest).authUser = authUser;
  next();
}
