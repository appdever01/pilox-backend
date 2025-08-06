const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: Schema.Types.ObjectId,
      ref: 'Currency',
      required: true,
    },
    method: {
      type: String,
      uppercase: true,
      enum: ['PAYSTACK', 'PAYPAL', 'STRIPE', 'PILOX'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    credits: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    verificationResponse: {
      type: Schema.Types.Mixed,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Payment', PaymentSchema);
