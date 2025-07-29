const { Feedback } = require('@models');
const { response } = require('@helpers');
const { v4: uuidv4 } = require('uuid');
class FeedbackController {
  async submitFeedback(req, res) {
    try {
      const userId = req.user._id;
      const { type, title, description, priority, steps, expectedBehavior, actualBehavior } = req.body;
      if ( !type || !title || !description || !priority ) {
        return response(res, 400, 'error', 'Feedback type, title, description, and priority are required');
      }
      if (priority !== 'low' && priority !== 'medium' && priority !== 'high') {
        return response(res, 400, 'error', 'Priority must be low, medium, or high');
      }
      if (type === 'bug') {
        if (!steps || !expectedBehavior || !actualBehavior) {
          return response(res, 400, 'error', 'Steps, expected behavior, and actual behavior are required for bug reports');
        }
      }
      
      const reference = uuidv4();
      await Feedback.create({ reference, type, title, description, priority, steps, expectedBehavior, actualBehavior, user: userId });
      return response(res, 200, 'success', 'Feedback submitted successfully');
    } catch (error) {
      return response(res, 500, 'error', 'Failed to submit feedback');
    }
  }

  async getFeedbackData(req, res) {
    try {
      const user = req.user;
      const feedback = await Feedback.find({ user: user._id });
      const totalSubmissions = feedback.length;
      const totalCreditsEarned = feedback.reduce((sum, item) => sum + item.rewardAmount, 0);
      const totalRewarded = feedback.filter(item => item.rewarded).length;
      return response(res, 200, 'success', 'Feedback retrieved successfully', { totalSubmissions, totalCreditsEarned, totalRewarded });
    } catch (error) {
      return response(res, 500, 'error', 'Failed to retrieve feedback');
    }
  }

  async getFeedbackHistory(req, res) {
    try {
      const user = req.user;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const feedbacks = await Feedback.find({ user: user._id })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await Feedback.countDocuments({ user: user._id });
      const totalPages = Math.ceil(total / limit);

      return response(res, 200, 'success', 'Feedback retrieved successfully', {
        feedbacks,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      });
    } catch (error) {
      return response(res, 500, 'error', 'Failed to retrieve feedback history');
    }
  }
}

module.exports = new FeedbackController();
