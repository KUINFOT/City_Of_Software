import { Router } from 'express';
import {
  listSources,
  triggerRun,
  listJobs,
  getJob,
  listAiJobs,
  getAiJob,
} from '../controllers/extraction.controller';

const router = Router();

router.get('/sources', listSources);
router.post('/sources/:id/run', triggerRun);
router.get('/jobs', listJobs);
router.get('/jobs/:id', getJob);
router.get('/ai-jobs', listAiJobs);
router.get('/ai-jobs/:id', getAiJob);

export default router;
