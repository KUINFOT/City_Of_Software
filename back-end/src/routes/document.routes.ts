import { Router } from 'express';
import { requirePdfUpload, upload } from '../middleware/upload';
import { requireAdmin } from '../middleware/auth.middleware';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentFile,
  summarizeDocument,
} from '../controllers/document.controller';

const router = Router();

// The list/detail endpoints back public search. File bytes are different:
// `/:id/file` requires a signed per-document token issued only by an
// authorized vendor or administrator flow.
router.post('/upload', requireAdmin, upload.single('file'), requirePdfUpload, uploadDocument);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.get('/:id/file', getDocumentFile);
router.post('/:id/summarize', requireAdmin, summarizeDocument);

export default router;
