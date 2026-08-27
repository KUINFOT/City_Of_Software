import { Router } from 'express';
import {
  listReviewQueue,
  getReviewRecord,
  approveRecord,
  rejectRecord,
  supersedeRecord,
} from '../controllers/review.controller';

// TODO: add auth middleware (admin role) once it exists — see the note at
// the top of review.controller.ts.
const router = Router();

router.get('/queue', listReviewQueue);
router.get('/queue/:id', getReviewRecord);
router.post('/queue/:id/approve', approveRecord);
router.post('/queue/:id/reject', rejectRecord);
router.post('/queue/:id/supersede', supersedeRecord);

export default router;
