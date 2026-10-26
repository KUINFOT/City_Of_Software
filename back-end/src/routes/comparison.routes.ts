import { Router } from 'express';
import { previewComparison } from '../controllers/comparison.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();

router.post('/preview', requireVendor, previewComparison);

export default router;
