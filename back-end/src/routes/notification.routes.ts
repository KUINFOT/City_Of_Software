import { Router } from 'express';
import { listNotifications } from '../controllers/notification.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireVendor, listNotifications);

export default router;
