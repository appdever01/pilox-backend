const express = require('express');
const router = express.Router();
const { authMiddleware } = require('@middleware/auth');
const FeedbackController = require('@controllers/FeedbackController');

router.use(authMiddleware);

router.post('/submit', FeedbackController.submitFeedback);
router.get('/history', FeedbackController.getFeedbackHistory);
router.get('/data', FeedbackController.getFeedbackData);

module.exports = router;


