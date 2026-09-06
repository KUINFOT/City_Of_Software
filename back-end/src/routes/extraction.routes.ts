import { Router } from 'express';
import {
  listSources,
  triggerRun,
  listJobs,
  getJob,
  listAiJobs,
  getAiJob,
  getSourcesHealth,
} from '../controllers/extraction.controller';

const router = Router();

router.get('/sources', listSources);
router.get('/health', getSourcesHealth);
router.post('/sources/:id/run', triggerRun);
router.get('/jobs', listJobs);
router.get('/jobs/:id', getJob);
router.get('/ai-jobs', listAiJobs);
router.get('/ai-jobs/:id', getAiJob);

export default router;
