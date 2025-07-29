const express = require('express');
const router = express.Router();
const YouTubeController = require('@controllers/YouTubeController');
const { authMiddleware } = require('@middleware/auth');

router.use(authMiddleware);

// Static page routes
router.post('/chat-with-video', YouTubeController.chatWithVideo);
router.post('/get-progress', YouTubeController.getProgress);
router.get('/chat-history/:chatId', YouTubeController.getChatHistory);
router.get('/all-chat-history', YouTubeController.getAllChatHistory);
router.post(
  '/increase-chat-limit/:chatId',
  YouTubeController.increaseChatLimit
);
router.delete(
  '/delete-chat-history/:chatId',
  YouTubeController.deleteChatHistory
);

module.exports = router;
