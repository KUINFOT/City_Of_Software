import { Router } from 'express';
import { getVendorProfile, saveVendorProfile, unsubscribeByToken } from '../controllers/vendorProfile.controller';
import { requireAuthenticated, requireSelfOrAdmin } from '../middleware/auth.middleware';

const router = Router();
// Must come before '/:userId' — otherwise Express would match "unsubscribe" as
// a userId. Deliberately NOT behind requireAuthenticated: it's a one-click
// link opened straight from an email with no session to authenticate.
router.get('/unsubscribe', (req, res) => { unsubscribeByToken(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
router.get('/:userId', requireAuthenticated, requireSelfOrAdmin, (req, res) => { getVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
router.put('/:userId', requireAuthenticated, requireSelfOrAdmin, (req, res) => { saveVendorProfile(req, res).catch(() => res.status(503).json({ error: 'Profile service is temporarily unavailable.' })); });
export default router;
