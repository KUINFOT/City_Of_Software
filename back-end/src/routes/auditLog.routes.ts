import { Router } from 'express';
import { listAuditLog } from '../controllers/auditLog.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAdmin, listAuditLog);

export default router;
