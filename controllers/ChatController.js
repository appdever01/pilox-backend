const { ChatHistory } = require('@models');
const { response } = require('@helpers');

class ChatController {
  async getChatHistory(req, res) {
    try {
      const histories = await ChatHistory.find(
        { userId: req.user._id },
        {
          pdfId: 1,
          filename: 1,
          createdAt: 1,
          lastUpdated: 1,
          _id: 1,
        }
      ).sort({ lastUpdated: -1 });

      return response(
        res,
        200,
        'success',
        'Chat histories fetched successfully',
        {
          histories,
        }
      );
    } catch (error) {
      console.error('Error fetching chat histories:', error);
      return response(res, 500, 'error', 'Failed to fetch chat histories');
    }
  }

  async getMessages(req, res) {
    try {
      const { pdfId } = req.params;
      const chatHistory = await ChatHistory.findOne({
        pdfId,
        userId: req.user._id,
      });

      if (!chatHistory) {
        return response(res, 200, 'error', 'Chat history not found');
      }

      return response(
        res,
        200,
        'success',
        'Chat history fetched successfully',
        {
          messages: chatHistory.messages,
          explanations: chatHistory.explanations,
          relatedVideos: chatHistory.relatedVideos,
          pdfId: chatHistory.pdfId,
          createdAt: chatHistory.createdAt,
          lastUpdated: chatHistory.lastUpdated,
          filename: chatHistory.filename,
          pdfUrl: chatHistory.pdfUrl,
          videoUrl: chatHistory.videoUrl,
          videoGenerationCompleted: chatHistory.videoGenerationCompleted,
          videoGenerationError: chatHistory.videoGenerationError,
        }
      );
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return response(res, 500, 'error', 'Failed to fetch chat messages');
    }
  }

  async deleteChatHistory(req, res) {
    try {
      const { pdfId } = req.params;
      const result = await ChatHistory.findOneAndDelete({
        pdfId,
        userId: req.user._id,
      });

      if (!result) {
        return response(res, 200, 'error', 'Chat history not found');
      }
      return response(res, 200, 'success', 'Chat history deleted successfully');
    } catch (error) {
      console.error('Error deleting chat history:', error);
      return response(res, 500, 'error', 'Failed to delete chat history');
    }
  }
}

module.exports = new ChatController();
