import { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { readSessionToken } from '../services/session.service';

export type AuthenticatedRequest = Request & { authUser: { id: string; role: 'vendor' | 'reviewer' | 'admin'; name: string } };

/**
 * Reads the bearer session token and reloads the user, so a role/status
 * change (or a forced sign-out via `sessionVersion`) takes effect
 * immediately rather than waiting for the token to expire on its own.
 * Returns null for anything invalid — expired/tampered token, missing
 * header, or a user that no longer matches the session's claims — without
 * distinguishing why, since neither `requireAdmin` nor `requireVendor`
 * needs to.
 */
async function authenticate(req: Request): Promise<{ id: string; name: string; role: 'vendor' | 'reviewer' | 'admin' } | null> {
  const token = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? readSessionToken(token) : null;
  if (!session) return null;

  const user = await UserModel.findById(session.sub).select('name role status sessionVersion');
  if (!user || user.status !== 'active' || user.sessionVersion !== session.sv) return null;

  return { id: user._id.toString(), name: user.name, role: user.role as 'vendor' | 'reviewer' | 'admin' };
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

/**
 * Vendor-role-gated routes (US-017's qualification match, etc). A guest
 * (no/invalid token) gets 401 — SRS UC-03 extension 5a's "invite
 * registration in place of the qualification panel" is a frontend decision
 * made from that same signal, not something this middleware renders itself.
 */
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
