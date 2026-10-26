import { Router } from 'express';
import { listBookmarks } from '../controllers/bookmark.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireVendor, listBookmarks);

export default router;
