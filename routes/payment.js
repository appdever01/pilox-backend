const express = require('express');
const PaymentController = require('@controllers/PaymentController');
const paymentController = new PaymentController();
const router = express.Router();
const { authMiddleware } = require('@middleware/auth');

router.use(authMiddleware);
router.get('/rate', paymentController.getRate);

module.exports = router;
