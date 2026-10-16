import { Router } from 'express';
import { listBookmarks, removeBookmark, saveBookmark } from '../controllers/bookmark.controller';
import { requireAuthenticated } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuthenticated);
router.get('/', listBookmarks);
router.post('/', saveBookmark);
router.delete('/:torId', removeBookmark);

export default router;
