import { Router } from 'express';
import { getAgencyFrequency, getBudgetComparison } from '../controllers/analytics.controller';
import { requireAuthenticated } from '../middleware/auth.middleware';

const router = Router();

router.get('/budgets', requireAuthenticated, getBudgetComparison);
router.get('/agency-frequency', requireAuthenticated, getAgencyFrequency);

export default router;
