import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import documentRoutes from './document.routes';
import extractionRoutes from './extraction.routes';
import reviewRoutes from './review.routes';
import torRoutes from './tor.routes';
import auditLogRoutes from './auditLog.routes';
import vendorProfileRoutes from './vendorProfile.routes';
import adminUsersRoutes from './adminUsers.routes';
import notificationRoutes from './notification.routes';
import agencyRoutes from './agency.routes';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);
router.use('/extraction', extractionRoutes);
router.use('/review', reviewRoutes);
router.use('/tors', torRoutes);
router.use('/audit-log', auditLogRoutes);
router.use('/vendor-profiles', vendorProfileRoutes);
router.use('/admin', adminUsersRoutes);
router.use('/notifications', notificationRoutes);
router.use('/agencies', agencyRoutes);

export default router;
