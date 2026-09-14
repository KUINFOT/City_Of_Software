import { Router } from 'express';
import { listTors, getTor, listTorDocuments, getQualificationMatch } from '../controllers/tor.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();

router.get('/', listTors);
router.get('/:id', getTor);
router.get('/:id/documents', listTorDocuments);
router.get('/:id/qualification-match', requireVendor, getQualificationMatch);

export default router;
