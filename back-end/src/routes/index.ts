import { Router, Request, Response } from 'express';
import documentRoutes from './document.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/documents', documentRoutes);

export default router;
