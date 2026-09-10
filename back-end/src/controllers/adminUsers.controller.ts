import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { AuditLogModel } from '../models/AuditLog';
import { UserModel } from '../models/User';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const ROLES = new Set(['vendor', 'reviewer', 'admin']);
const MANAGEABLE_STATUSES = new Set(['active', 'suspended']);

function managedUser(user: { _id: { toString(): string }; name: string; email: string; organization?: string | null; phone?: string | null; role: string; status: string; emailVerified: boolean; createdAt: Date; lastLoginAt?: Date | null }) {
  return {
    id: user._id.toString(), name: user.name, email: user.email, organization: user.organization ?? '', phone: user.phone ?? '',
    role: user.role, status: user.status, emailVerified: user.emailVerified, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt ?? null,
  };
}

/** GET /api/admin/users — list real accounts without password or session data. */
export async function listManagedUsers(_req: Request, res: Response): Promise<void> {
  const users = await UserModel.find().select('-passwordHash -sessionVersion').sort({ createdAt: -1 });
  res.json({ users: users.map(managedUser) });
}

/** PATCH /api/admin/users/:id — change one account's role or access status, with an audit record. */
export async function updateManagedUser(req: Request, res: Response): Promise<void> {
  const actor = (req as AuthenticatedRequest).authUser;
  const userId = req.params.id;
  const role = typeof req.body.role === 'string' ? req.body.role : undefined;
  const status = typeof req.body.status === 'string' ? req.body.status : undefined;

  if (!isValidObjectId(userId) || (!role && !status) || (role && !ROLES.has(role)) || (status && !MANAGEABLE_STATUSES.has(status))) {
    res.status(400).json({ error: 'Provide a valid account, role, or status update.' });
    return;
  }
  if (userId === actor.id) {
    res.status(400).json({ error: 'You cannot change your own administrator role or access from this screen.' });
    return;
  }

  const target = await UserModel.findById(userId);
  if (!target) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  const before = { role: target.role, status: target.status };
  if (role) target.role = role as 'vendor' | 'reviewer' | 'admin';
  if (status) target.status = status as 'active' | 'suspended';
  const after = { role: target.role, status: target.status };
  if (before.role === after.role && before.status === after.status) {
    res.json({ user: managedUser(target) });
    return;
  }

  // Incrementing this revokes a changed user's existing sessions immediately.
  target.sessionVersion += 1;
  await target.save();
  await AuditLogModel.create({
    actorId: actor.id,
    action: before.role !== after.role ? 'user.role.updated' : 'user.status.updated',
    entityType: 'user',
    entityId: target._id,
    before,
    after,
    ipAddress: req.ip,
  });
  res.json({ user: managedUser(target) });
}
