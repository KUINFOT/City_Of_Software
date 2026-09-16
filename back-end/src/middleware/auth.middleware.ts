import { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { SessionModel } from '../models/Session';
import { readSessionToken, sessionIdleExpiresAt } from '../services/session.service';

export type AuthenticatedRequest = Request & { authUser: { id: string; role: 'vendor' | 'reviewer' | 'admin'; name: string } };

/** Checks a signed, active session and reloads the account on every request. */
export async function requireAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? readSessionToken(token) : null;
  if (!session) {
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }

  const now = new Date();
  const activeSession = await SessionModel.findOneAndUpdate(
    { userId: session.sub, sessionId: session.sid, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { lastActivityAt: now, expiresAt: sessionIdleExpiresAt(now) } },
    { new: true }
  );
  if (!activeSession) {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }

  const user = await UserModel.findById(session.sub).select('name role status sessionVersion');
  if (!user || user.status !== 'active' || user.sessionVersion !== session.sv || !['vendor', 'reviewer', 'admin'].includes(user.role)) {
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }

  (req as AuthenticatedRequest).authUser = { id: user._id.toString(), name: user.name, role: user.role as 'vendor' | 'reviewer' | 'admin' };
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

/** Requires an active administrator session. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuthenticated(req, res, () => {
    if ((req as AuthenticatedRequest).authUser.role !== 'admin') {
      res.status(403).json({ error: 'Administrator access is required.' });
      return;
    }
    next();
  });
}
