import { Router } from 'express';
import { getVendorProfile, saveVendorProfile, unsubscribeByToken } from '../controllers/vendorProfile.controller';

const router = Router();
// Must come before '/:userId' — otherwise Express would match "unsubscribe" as a userId.
router.get('/unsubscribe', (req, res) => { unsubscribeByToken(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
router.get('/:userId', (req, res) => { getVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
router.put('/:userId', (req, res) => { saveVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
export default router;
