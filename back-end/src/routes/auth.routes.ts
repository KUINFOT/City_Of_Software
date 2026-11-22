import { Router } from 'express';
import { beginGoogleLink, beginGoogleLogin, completeGoogleCallback, completeGoogleLogin, completeGoogleOnboarding, getGoogleLinkStatus, getGoogleOnboardingDetails, login, logout, register, resendVerification, verifyEmail, requestPasswordReset, resetPassword, completeVendorOnboarding } from '../controllers/auth.controller';
import { env } from '../config/env';
import { authLimiter, loginLimiter } from '../middleware/security.middleware';
import { requireAuthenticated } from '../middleware/auth.middleware';

const router = Router();
router.use(authLimiter);

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
router.post('/login', loginLimiter, (req, res) => {
  login(req, res).catch(() => {
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again later.' });
  });
});
router.get('/google', loginLimiter, (req, res) => { beginGoogleLogin(req, res); });
router.get('/google/link-status', requireAuthenticated, (req, res) => {
  getGoogleLinkStatus(req, res).catch(() => res.status(503).json({ error: 'Unable to read Google connection status.' }));
});
router.post('/google/link', loginLimiter, requireAuthenticated, (req, res) => {
  beginGoogleLink(req, res).catch(() => res.status(503).json({ error: 'Unable to start Google connection.' }));
});
router.get('/google/callback', loginLimiter, (req, res) => {
  completeGoogleCallback(req, res).catch(() => res.redirect(302, new URL('/login?oauth=denied', env.appUrl).toString()));
});
router.post('/google/complete', loginLimiter, (req, res) => {
  completeGoogleLogin(req, res).catch(() => res.status(503).json({ error: 'Google sign-in is temporarily unavailable. Please try again later.' }));
});
router.post('/google/onboarding/details', loginLimiter, (req, res) => {
  getGoogleOnboardingDetails(req, res).catch(() => res.status(503).json({ error: 'Google registration is temporarily unavailable. Please try again later.' }));
});
router.post('/google/onboarding', loginLimiter, (req, res) => {
  completeGoogleOnboarding(req, res).catch(() => res.status(503).json({ error: 'Google registration is temporarily unavailable. Please try again later.' }));
});
router.post('/logout', (req, res) => {
  logout(req, res).catch(() => {
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again later.' });
  });
});
router.post('/resend-verification', (req, res) => {
  resendVerification(req, res).catch(() => {
    res.status(503).json({ error: 'Authentication service is temporarily unavailable. Please try again later.' });
  });
});
router.post('/verify-email', (req, res) => {
  verifyEmail(req, res).catch(() => {
    res.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again later.' });
  });
});
router.post('/forgot-password', (req, res) => { requestPasswordReset(req, res).catch(() => res.status(503).json({ error: 'Authentication service is temporarily unavailable.' })); });
router.post('/reset-password', (req, res) => { resetPassword(req, res).catch(() => res.status(503).json({ error: 'Authentication service is temporarily unavailable.' })); });

export default router;
