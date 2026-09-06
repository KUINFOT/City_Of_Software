import { Router } from 'express';
import { listTors, getTor } from '../controllers/tor.controller';

const router = Router();

router.get('/', listTors);
router.get('/:id', getTor);

export default router;
