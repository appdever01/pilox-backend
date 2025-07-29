const express = require('express');
const router = express.Router();
const { authMiddleware } = require('@middleware/auth');
const ChatController = require('@controllers/ChatController');

// Get all chat histories
router.use(authMiddleware);
router.get('/histories', ChatController.getChatHistory);
router.get('/messages/:pdfId', ChatController.getMessages);
router.delete('/history/:pdfId', ChatController.deleteChatHistory);

module.exports = router;
