import { Router } from 'express';
import { getVendorProfile, saveVendorProfile } from '../controllers/vendorProfile.controller';
import { requireAuthenticated, requireSelfOrAdmin } from '../middleware/auth.middleware';

const router = Router();
router.get('/:userId', requireAuthenticated, requireSelfOrAdmin, (req, res) => { getVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
router.put('/:userId', requireAuthenticated, requireSelfOrAdmin, (req, res) => { saveVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
export default router;
