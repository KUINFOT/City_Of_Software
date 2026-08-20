import { Router } from 'express';
import {
  listSources,
  triggerRun,
  listJobs,
  getJob,
} from '../controllers/extraction.controller';

const router = Router();

router.get('/sources', listSources);
router.post('/sources/:id/run', triggerRun);
router.get('/jobs', listJobs);
router.get('/jobs/:id', getJob);

export default router;
