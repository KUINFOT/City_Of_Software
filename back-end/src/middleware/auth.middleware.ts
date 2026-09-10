import { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { readSessionToken } from '../services/session.service';

export type AuthenticatedRequest = Request & { authUser: { id: string; role: 'vendor' | 'reviewer' | 'admin'; name: string } };

/** Checks the signed session and reloads the user, so role/status changes take effect immediately. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = token ? readSessionToken(token) : null;
  if (!session) {
    res.status(401).json({ error: 'Please sign in again to continue.' });
    return;
  }

  const user = await UserModel.findById(session.sub).select('name role status sessionVersion');
  if (!user || user.status !== 'active' || user.role !== 'admin' || user.sessionVersion !== session.sv) {
    res.status(403).json({ error: 'Administrator access is required.' });
    return;
  }

  (req as AuthenticatedRequest).authUser = { id: user._id.toString(), name: user.name, role: 'admin' };
  next();
}
