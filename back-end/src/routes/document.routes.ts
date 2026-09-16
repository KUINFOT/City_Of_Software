import { Router } from 'express';
import { upload } from '../middleware/upload';
import { requireAdmin } from '../middleware/auth.middleware';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentFile,
  summarizeDocument,
} from '../controllers/document.controller';

const router = Router();

// Read endpoints stay public — GET / backs the public /search page and GET
// /:id/file is also reached unauthenticated via a signed per-document token
// (see the handler's doc comment) by vendors, not just admins.
router.post('/upload', requireAdmin, upload.single('file'), uploadDocument);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.get('/:id/file', getDocumentFile);
router.post('/:id/summarize', requireAdmin, summarizeDocument);

export default router;
