const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema(
  {
    libraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Library',
      required: true,
      index: true,
    },
    seatNumber: {
      type: String,
      required: true,
      trim: true,
    },
    row: {
      type: String,
      default: 'A',
    },
    floor: {
      type: String,
      default: 'Floor 1',
    },
    status: {
      type: String,
      enum: ['Available', 'Occupied', 'Maintenance', 'Reserved'],
      default: 'Available',
    },
    assignedStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    currentStudentName: {
      type: String,
      default: '',
    },
    currentShift: {
      type: String,
      default: 'Full Day (24x7)',
    },
    bookedSlots: [
      {
        slot: String,
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
        studentName: String,
      },
    ],
  },
  { timestamps: true }
);

seatSchema.index({ libraryId: 1, seatNumber: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
