import { Router } from 'express';
import { listTors, getTor, listTorDocuments, getQualificationMatch, getMatchReasons } from '../controllers/tor.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();

router.get('/', listTors);
router.get('/:id', getTor);
router.get('/:id/documents', listTorDocuments);
router.get('/:id/qualification-match', requireVendor, getQualificationMatch);
router.get('/:id/match-reasons', requireVendor, getMatchReasons);

export default router;
