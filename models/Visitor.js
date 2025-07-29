const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    index: true,
  },
  userAgent: String,
  country: {
    code: String,
    name: String,
  },
  lastVisit: {
    type: Date,
    default: Date.now,
  },
  visitCount: {
    type: Number,
    default: 1,
  },
});

module.exports = mongoose.model('Visitor', visitorSchema);
