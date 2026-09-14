import { Router } from 'express';
import { listManagedUsers, updateManagedUser } from '../controllers/adminUsers.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/users', requireAdmin, (req, res, next) => { listManagedUsers(req, res).catch(next); });
router.patch('/users/:id', requireAdmin, (req, res, next) => { updateManagedUser(req, res).catch(next); });

export default router;
