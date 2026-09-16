import { Router } from 'express';
import { upload } from '../middleware/upload';
import { requireAdmin } from '../middleware/auth.middleware';
import {
  createManualTor,
  listReviewQueue,
  getReviewRecord,
  correctFields,
  approveRecord,
  rejectRecord,
  supersedeRecord,
} from '../controllers/review.controller';

const router = Router();

router.use(requireAdmin);
router.post('/tors', upload.single('file'), createManualTor);
router.get('/queue', listReviewQueue);
router.get('/queue/:id', getReviewRecord);
router.patch('/queue/:id/fields', correctFields);
router.post('/queue/:id/approve', approveRecord);
router.post('/queue/:id/reject', rejectRecord);
router.post('/queue/:id/supersede', supersedeRecord);

export default router;
