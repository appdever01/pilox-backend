const path = require('path');
const express = require('express');
const PaymentController = require('@controllers/PaymentController');
const paymentController = new PaymentController();

const {
  authRoutes,
  analyticsRoutes,
  adminRoutes,
  pdfRoutes,
  youTubeRoutes,
  userRoutes,
  paymentRoutes,
  chatRoutes,
  feedbackRoutes,
} = require('@routes/index');

const router = express.Router();

router.use('/api/auth', authRoutes);
router.use('/api/analytics', analyticsRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/pdf', pdfRoutes);
router.use('/api/youtube', youTubeRoutes);
router.use('/api/user', userRoutes);
router.use('/api/payment', paymentRoutes);
router.use('/api/chat', chatRoutes);
router.use('/api/feedback', feedbackRoutes);
const { response } = require('@helpers');

router.post(
  '/paystack-webhook/:secret',
  express.json(),
  paymentController.paystackWebhook
);

module.exports = router;
