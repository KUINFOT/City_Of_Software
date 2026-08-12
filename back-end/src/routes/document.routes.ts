import { Router } from 'express';
import { upload } from '../middleware/upload';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  summarizeDocument,
} from '../controllers/document.controller';

const router = Router();

router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.post('/:id/summarize', summarizeDocument);

export default router;
