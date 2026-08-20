import { Router, Request, Response } from 'express';
import documentRoutes from './document.routes';
import extractionRoutes from './extraction.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/documents', documentRoutes);
router.use('/extraction', extractionRoutes);

export default router;
