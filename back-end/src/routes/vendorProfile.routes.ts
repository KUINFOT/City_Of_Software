import { Router } from 'express';
import { getVendorProfile, saveVendorProfile } from '../controllers/vendorProfile.controller';

const router = Router();
router.get('/:userId', (req, res) => { getVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
router.put('/:userId', (req, res) => { saveVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
export default router;
