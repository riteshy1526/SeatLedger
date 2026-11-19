const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Library',
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    seatNumber: {
      type: String,
      required: true,
      trim: true,
    },
    shift: {
      type: String,
      default: 'Full Day (24x7)',
    },
    slots: {
      type: [String],
      default: ['Full Day (24x7)'],
    },
    contactNo: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    fatherName: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    monthlyFee: {
      type: Number,
      required: true,
      min: 0,
    },
    monthlyFeeOverride: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
      index: true,
    },
    // AI Prediction cached attributes
    aiRiskScore: {
      type: Number,
      default: null, // 0 to 100
    },
    aiRiskLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', null],
      default: null,
    },
    aiPredictionReason: {
      type: String,
      default: '',
    },
    lastPredictedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Student', studentSchema);
