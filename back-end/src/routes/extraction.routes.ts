import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
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

router.use(requireAdmin);
router.get('/sources', listSources);
router.get('/health', getSourcesHealth);
router.post('/sources/:id/run', triggerRun);
router.get('/jobs', listJobs);
router.get('/jobs/:id', getJob);
router.get('/ai-jobs', listAiJobs);
router.get('/ai-jobs/:id', getAiJob);

export default router;
