const mongoose = require('mongoose');

const librarySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      default: 'Varanasi',
    },
    address: {
      type: String,
      default: '',
    },
    phone: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
    paymentDetails: {
      razorpayLinkedAccountId: { type: String, default: '' },
      razorpayTransferReadyAt: { type: Date, default: null },
    },
    totalSeats: {
      type: Number,
      default: 60,
    },
    defaultMonthlyFee: {
      type: Number,
      default: 800,
    },
    shifts: {
      type: [String],
      default: [
        'Morning (06:00 AM - 12:00 PM)',
        'Afternoon (12:00 PM - 06:00 PM)',
        'Evening (06:00 PM - 12:00 AM)',
        'Night Shift (12:00 AM - 06:00 AM)',
        'Full Day (24x7)',
      ],
    },
    feeSchedules: [
      {
        effectiveFrom: {
          type: Date,
          required: true,
        },
        slotFees: [
          {
            slot: { type: String, required: true, trim: true },
            monthlyFee: { type: Number, required: true, min: 0 },
          },
        ],
      },
    ],
    settings: {
      currency: { type: String, default: 'INR' },
      reminderDaysBeforeDue: { type: Number, default: 3 },
      enableWhatsappReminder: { type: Boolean, default: true },
      enableEmailReminder: { type: Boolean, default: true },
      dueDayOfMonth: { type: Number, default: 5 },
    },
    subscriptionStatus: {
      type: String,
      enum: ['active', 'trial', 'past_due', 'canceled'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Library', librarySchema);
