import { Router } from 'express';
import { login, register, resendVerification, verifyEmail, requestPasswordReset, resetPassword, completeVendorOnboarding } from '../controllers/auth.controller';
import { env } from '../config/env';

const router = Router();

router.post('/register', (req, res) => {
  register(req, res).catch(() => {
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again later.' });
  });
});
router.post('/complete-vendor-onboarding', (req, res) => {
  completeVendorOnboarding(req, res).catch(() => {
    res.status(503).json({ error: 'Registration service is temporarily unavailable. Please try again later.' });
  });
});
router.post('/login', (req, res) => {
  login(req, res).catch(() => {
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again later.' });
  });
});
router.post('/resend-verification', (req, res) => {
  resendVerification(req, res).catch(() => {
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again later.' });
  });
});
router.get('/verify-email', (req, res) => {
  verifyEmail(req, res).catch(() => {
    res.redirect(302, new URL('/verify-email?status=invalid', env.appUrl).toString());
  });
});
router.post('/forgot-password', (req, res) => { requestPasswordReset(req, res).catch(() => res.status(503).json({ error: 'Authentication service is temporarily unavailable.' })); });
router.post('/reset-password', (req, res) => { resetPassword(req, res).catch(() => res.status(503).json({ error: 'Authentication service is temporarily unavailable.' })); });

export default router;
