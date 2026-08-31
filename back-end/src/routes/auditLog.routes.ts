import { Router } from 'express';
import { listAuditLog } from '../controllers/auditLog.controller';

const router = Router();

router.get('/', listAuditLog);

export default router;
