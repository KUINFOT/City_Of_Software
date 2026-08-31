import { Router, Request, Response } from 'express';
import documentRoutes from './document.routes';
import extractionRoutes from './extraction.routes';
import reviewRoutes from './review.routes';
import torRoutes from './tor.routes';
import auditLogRoutes from './auditLog.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/documents', documentRoutes);
router.use('/extraction', extractionRoutes);
router.use('/review', reviewRoutes);
router.use('/tors', torRoutes);
router.use('/audit-log', auditLogRoutes);

export default router;
