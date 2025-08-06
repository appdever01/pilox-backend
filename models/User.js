const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  authMode: {
    type: String,
    enum: ['normal', 'google', 'facebook'],
  },
  password: {
    type: String,
  },
  name: {
    type: String,
    required: true,
  },
  country: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Country',
    required: true,
  },
  currency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Currency',
    required: true,
  },
  referralCode: {
    type: String,
    default: null,
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  referralCredit: {
    type: Number,
    default: 0,
  },
  credits: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationToken: {
    type: String,
    default: null,
  },
  verificationTokenExpires: {
    type: Date,
    default: null,
  },
  lastSentVerificationEmail: {
    type: Date,
    default: null,
  },
  lastSentPasswordResetEmail: {
    type: Date,
    default: null,
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user',
  },
  walletAddress: {
    type: String,
    default: null,
  },
});

module.exports = mongoose.model('User', userSchema);
