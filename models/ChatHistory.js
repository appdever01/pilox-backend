const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'model'],
    required: true,
  },
  parts: [
    {
      text: {
        type: String,
        required: true,
      },
    },
  ],
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  pdfId: {
    type: String,
    required: true,
    index: true,
  },
  filename: {
    type: String,
    required: true,
  },
  pdfUrl: {
    type: String,
    required: true,
  },
  messages: [messageSchema],
  explanations: [],
  relatedVideos: [],
  keywords: [],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  videoUrl: {
    type: String,
    default: null,
  },
  videoGenerationCompleted: {
    type: Boolean,
    default: false,
  },
  videoGenerationError: {
    type: String,
    default: null,
  },
});

// Keep only last 10 messages
chatHistorySchema.pre('save', function (next) {
  if (this.messages.length > 10) {
    this.messages = this.messages.slice(-10);
  }
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
