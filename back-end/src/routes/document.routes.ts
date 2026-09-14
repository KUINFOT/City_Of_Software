import { Router } from 'express';
import { upload } from '../middleware/upload';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentFile,
  summarizeDocument,
} from '../controllers/document.controller';

const router = Router();

router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.get('/:id/file', getDocumentFile);
router.post('/:id/summarize', summarizeDocument);

export default router;
