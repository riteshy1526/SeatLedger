const mongoose = require('mongoose');

const reminderLogSchema = new mongoose.Schema(
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
    },
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeePayment',
      default: null,
    },
    channel: {
      type: String,
      enum: ['EMAIL', 'WHATSAPP'],
      required: true,
    },
    recipient: {
      type: String,
      required: true,
    },
    studentName: {
      type: String,
      default: '',
    },
    amount: {
      type: Number,
      default: 0,
    },
    messageBody: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Queued', 'Sent', 'Failed', 'Simulated'],
      default: 'Queued',
    },
    errorMessage: {
      type: String,
      default: '',
    },
    jobId: {
      type: String,
      default: '',
    },
    automationKey: {
      type: String,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

reminderLogSchema.index({ automationKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ReminderLog', reminderLogSchema);
