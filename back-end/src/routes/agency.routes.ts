import { Router } from 'express';
import { listAgencies } from '../controllers/agency.controller';

const router = Router();

router.get('/', listAgencies);

export default router;
