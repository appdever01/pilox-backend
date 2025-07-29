const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  reference: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['bug', 'feature', 'improvement'],
    default: 'bug'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  steps: {
    type: String
  },
  expectedBehavior: {
    type: String
  },
  actualBehavior: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rewarded: {
    type: Boolean,
    default: false
  },
  rewardAmount: {
    type: Number,
    default: 0
  },
  response: {
    type: String
  },
  status: {
    type: String,
    enum: ['open', 'reviewing', 'closed'],
    default: 'open'
  }
});

module.exports = mongoose.model('Feedback', feedbackSchema);
