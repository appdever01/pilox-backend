const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'model'],
    required: true,
  },
  question: {
    type: String,
  },
  data: [
    {
      metadata: {
        title: {
          type: String,
        },
        sections: [
          {
            title: {
              type: String,
            },
            timestamp: {
              type: String,
            },
            duration: {
              type: String,
            },
          },
        ],
        keyPoints: [
          {
            type: String,
          },
        ],
      },
      analysis: {
        summary: {
          type: String,
        },
        evidence: [
          {
            quote: {
              type: String,
            },
            timestamp: {
              type: String,
            },
            context: {
              type: String,
            },
          },
        ],
        concepts: [
          {
            term: {
              type: String,
            },
            explanation: {
              type: String,
            },
          },
        ],
      },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const youtubeChatHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  video_id: {
    type: String,
    required: true,
    index: true,
  },
  limit: {
    type: Number,
    default: 0,
  },
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  title: {
    type: String,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('YoutubeChatHistory', youtubeChatHistorySchema);
