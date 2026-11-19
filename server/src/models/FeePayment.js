const mongoose = require('mongoose');

const feePaymentSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Library',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2020,
      max: 2050,
    },
    amountDue: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    balance: {
      type: Number,
      default: function () {
        return this.amountDue - this.amountPaid;
      },
    },
    status: {
      type: String,
      enum: ['Paid', 'Partial', 'Due'],
      default: 'Due',
      index: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ['Razorpay', 'Cash', 'UPI', 'Bank Transfer', 'None'],
      default: 'None',
    },
    // Razorpay Integration fields
    razorpayOrderId: {
      type: String,
      default: '',
    },
    razorpayPaymentId: {
      type: String,
      default: '',
    },
    razorpaySignature: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

feePaymentSchema.index({ libraryId: 1, studentId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('FeePayment', feePaymentSchema);
