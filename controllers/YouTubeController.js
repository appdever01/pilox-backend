const YouTubeService = require('@services/YouTubeService');
const youtubeService = new YouTubeService();
const { YoutubeChatHistory } = require('@models');
const { checkUsedYoutubeVideoChat, response } = require('@helpers');
class YouTubeController {
  async chatWithVideo(req, res) {
    try {
      const {
        url,
        question = 'Summarize this video with short words',
        chat_id = null,
      } = req.body;
      if (!url || !question) {
        return response(res, 200, 'error', 'URL and question are required');
      }
      const youtubeUrlPattern =
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i;
      if (!youtubeUrlPattern.test(url)) {
        return response(
          res,
          200,
          'error',
          'Invalid YouTube URL. Must be from youtube.com or youtu.be'
        );
      }
      const userId = req.user._id;
      const data = await youtubeService.askQuestion(
        userId,
        url,
        question,
        chat_id
      );
      return response(
        res,
        200,
        data.status,
        data.message,
        data.data || {}
      );
    } catch (error) {
      console.error('Error in chatWithVideo:', error);
      return response(res, 500, 'error', 'Failed to chat with video');
    }
  }

  async deleteChatHistory(req, res) {
    try {
      const { chatId } = req.params;
      const data = await youtubeService.deleteChatHistory(chatId);
      return response(
        res,
        200,
        data.status,
        data.message,
        data.data || {}
      );
    } catch (error) {
      return response(res, 500, 'error', error.message);
    }
  }

  async increaseChatLimit(req, res) {
    try {
      const { chatId } = req.params;
      const { credits } = req.body;
      if (!chatId || !credits) {
        return response(res, 200, 'error', 'Chat ID and credits are required');
      }
      const data = await youtubeService.increaseChatLimit(chatId, credits);
      return response(
        res,
        200,
        data.status,
        data.message,
        data.data || {}
      );
    } catch (error) {
      return response(res, 500, 'error', error.message);
    }
  }

  async getChatHistory(req, res) {
    const userId = req.user._id;
    const { chatId } = req.params;
    if (!chatId) {
      return response(res, 200, 'error', 'Chat ID is required');
    }
    const chatHistory = await YoutubeChatHistory.findOne({
      user: userId,
      _id: chatId,
    }).sort({ lastUpdated: -1 });
    if (!chatHistory) {
      return response(res, 200, 'error', 'Chat history not found');
    }
    const usage = await checkUsedYoutubeVideoChat(chatHistory._id);
    return response(res, 200, 'success', 'Chat history fetched successfully', {
      chatHistory,
      usage,
      limit: chatHistory.limit,
    });
  }

  async getAllChatHistory(req, res) {
    const userId = req.user._id;
    const chatHistory = await YoutubeChatHistory.find({ user: userId })
      .select('_id video_id title createdAt')
      .sort({ lastUpdated: -1 });
    return response(res, 200, 'success', 'Chat history fetched successfully', {
      chatHistory,
    });
  }

  async getProgress(req, res) {
    const { url } = req.body;
    if (!url) {
      return response(res, 200, 'error', 'URL is required');
    }
    const youtubeUrlPattern =
      /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i;
    if (!youtubeUrlPattern.test(url)) {
      return response(
        res,
        200,
        'error',
        'Invalid YouTube URL. Must be from youtube.com or youtu.be'
      );
    }
    const progress = await youtubeService.getProgress(url);
    return response(
      res,
      200,
      progress.status,
      progress.message,
      progress.data || {}
    );
  }
}

module.exports = new YouTubeController();
