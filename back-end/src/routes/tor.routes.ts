import { Router } from 'express';
import { listTors, getTor, listTorDocuments, getQualificationMatch, getMatchReasons } from '../controllers/tor.controller';
import { removeBookmark, saveBookmark, updateBookmarkNote } from '../controllers/bookmark.controller';
import { requireVendor } from '../middleware/auth.middleware';

const router = Router();

router.get('/', listTors);
router.get('/:id', getTor);
router.get('/:id/documents', listTorDocuments);
router.get('/:id/qualification-match', requireVendor, getQualificationMatch);
router.get('/:id/match-reasons', requireVendor, getMatchReasons);
router.put('/:id/bookmark', requireVendor, saveBookmark);
router.delete('/:id/bookmark', requireVendor, removeBookmark);
router.patch('/:id/bookmark/note', requireVendor, updateBookmarkNote);

export default router;
