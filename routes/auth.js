const express = require('express');
const router = express.Router();
const AuthController = require('@controllers/AuthController');
const { authMiddleware } = require('@middleware/auth');

router.post('/signup', AuthController.signup);
router.post('/login', AuthController.login);
router.post('/google-auth', AuthController.googleAuth);
router.post(
  '/resend-verification-email',
  authMiddleware,
  AuthController.resendVerificationEmail
);
router.post('/verify-email', authMiddleware, AuthController.verifyUser);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/newsletter-subscribe', AuthController.newsletterSubscribe);

// router.post('/v2/forgot-password', v2AuthController.forgotPassword);
// router.post('/v2/reset-password', v2AuthController.resetPassword);
// router.post('/v2/newsletter-subscribe', v2AuthController.newsletterSubscribe);
// router.post(
//   '/v2/newsletter-unsubscribe',
//   v2AuthController.newsletterUnsubscribe
// );
// router.post('/v2/waitlist/join', v2AuthController.joinWaitlist);
// router.post('/v2/waitlist/leave', v2AuthController.waitlistLeave);
// router.post('/v2/verify-email', v2AuthController.verifyUser);
// router.post('/v2/verify-email2', v2AuthController.verifyUser2);

module.exports = router;
