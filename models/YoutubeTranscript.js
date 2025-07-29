const mongoose = require('mongoose');

const transcriptEntrySchema = new mongoose.Schema({
  text: { type: String, required: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number, required: true },
});

const youtubeTranscriptSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  transcript: [transcriptEntrySchema],
  title: String,
  progress: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('YoutubeTranscript', youtubeTranscriptSchema);
