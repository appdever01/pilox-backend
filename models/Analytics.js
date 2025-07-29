const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    activityType: {
      type: String,
      enum: ['pdf_analysis', 'error', 'visit'],
      required: true,
      index: true,
    },
    details: {
      type: String,
      required: true,
    },
    metadata: {
      pdfName: String,
      userAgent: String,
      ip: String,
      errorCode: String,
    },
  },
  {
    timestamps: true,
  }
);

analyticsSchema.index({ sessionId: 1, activityType: 1, timestamp: -1 });

const Analytics = mongoose.model('Analytics', analyticsSchema);
Analytics.createIndexes().catch(console.error);

module.exports = Analytics;
