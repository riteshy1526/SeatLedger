const express = require('express');
const Library = require('../models/Library');
const Seat = require('../models/Seat');
const Student = require('../models/Student');
const User = require('../models/User');
const FeePayment = require('../models/FeePayment');
const { sendOtp } = require('../services/authOtp');
const { ensureLibrarySeats } = require('../utils/seatProvisioning');
const { normalizePhone, phoneLookupVariants } = require('../utils/phone');
const {
  calculateMonthlyFee,
  getActiveFeeSchedule,
  getLatestFeeSchedule,
  getUpcomingFeeSchedule,
} = require('../utils/feePricing');

const router = express.Router();

/**
 * Public: Explore all libraries (filter by city or search)
 */
router.get('/libraries', async (req, res) => {
  try {
    const { city = 'All', search = '' } = req.query;
    const filter = {
      subscriptionStatus: { $ne: 'canceled' },
      isDemo: { $ne: true },
    };

    if (city !== 'All') {
      filter.city = { $regex: new RegExp(`^${city}$`, 'i') };
    }

    if (search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { address: { $regex: search.trim(), $options: 'i' } },
        { city: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const libraries = await Library.find(filter).sort({ createdAt: -1 });

    const libraryIds = libraries.map((lib) => lib._id);
    const [activeStudents, unavailableSeats] = await Promise.all([
      Student.find({ libraryId: { $in: libraryIds }, status: 'Active' })
        .select('libraryId seatNumber')
        .lean(),
      Seat.find({
        libraryId: { $in: libraryIds },
        status: { $in: ['Occupied', 'Maintenance', 'Reserved'] },
      })
        .select('libraryId seatNumber')
        .lean(),
    ]);

    const occupiedByLibrary = new Map();
    activeStudents.forEach((student) => {
      if (!student.seatNumber) return;
      const libraryId = student.libraryId.toString();
      if (!occupiedByLibrary.has(libraryId)) occupiedByLibrary.set(libraryId, new Set());
      occupiedByLibrary.get(libraryId).add(student.seatNumber);
    });

    const blockedByLibrary = new Map();
    unavailableSeats.forEach((seat) => {
      const libraryId = seat.libraryId.toString();
      if (!blockedByLibrary.has(libraryId)) blockedByLibrary.set(libraryId, new Set());
      blockedByLibrary.get(libraryId).add(seat.seatNumber);
    });

    const enriched = libraries.map((lib) => {
      const total = lib.totalSeats || 50;
      const libraryId = lib._id.toString();
      const occupiedSeats = occupiedByLibrary.get(libraryId) || new Set();
      const blockedSeats = blockedByLibrary.get(libraryId) || new Set();
      const unavailableCount = new Set([...occupiedSeats, ...blockedSeats]).size;
      const latestSchedule = getLatestFeeSchedule(lib);
      const fullDayFee = latestSchedule.slotFees.find((fee) => /full\s*day/i.test(fee.slot))?.monthlyFee
        ?? latestSchedule.slotFees[0]?.monthlyFee
        ?? lib.defaultMonthlyFee;

      return {
        id: lib._id,
        name: lib.name,
        slug: lib.slug,
        city: lib.city,
        address: lib.address,
        phone: lib.phone,
        email: lib.email,
        totalSeats: total,
        vacantSeats: Math.max(0, total - unavailableCount),
        occupiedSeats: occupiedSeats.size,
        defaultMonthlyFee: fullDayFee,
        slotFees: latestSchedule.slotFees,
        upcomingFeeSchedule: null,
        shifts: latestSchedule.slotFees.map((fee) => fee.slot),
        settings: lib.settings,
      };
    });

    return res.json({ success: true, count: enriched.length, libraries: enriched });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Public: Get seat availability grid for a specific library
 */
router.get('/libraries/:id/seats', async (req, res) => {
  try {
    const library = await Library.findOne({ _id: req.params.id, isDemo: { $ne: true } });
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const seats = await ensureLibrarySeats(library._id, library.totalSeats);
    const latestSchedule = getLatestFeeSchedule(library);
    const fullDayFee = latestSchedule.slotFees.find((fee) => /full\s*day/i.test(fee.slot))?.monthlyFee
      ?? latestSchedule.slotFees[0]?.monthlyFee
      ?? library.defaultMonthlyFee;
    const activeStudents = await Student.find({ libraryId: library._id, status: 'Active' });

    const studentMap = {};
    activeStudents.forEach((st) => {
      studentMap[st.seatNumber] = {
        shift: st.shift,
        slots: st.slots,
      };
    });

    const seatData = seats.map((s) => {
      const booked = studentMap[s.seatNumber];
      return {
        id: s._id,
        seatNumber: s.seatNumber,
        row: s.row,
        status: booked ? 'Occupied' : s.status,
        currentShift: booked ? booked.shift : 'Available',
        slots: booked ? booked.slots : [],
      };
    });
    const availableSeats = seatData.filter((seat) => seat.status === 'Available').length;

    return res.json({
      success: true,
      library: {
        id: library._id,
        name: library.name,
        city: library.city,
        monthlyFee: fullDayFee,
        shifts: latestSchedule.slotFees.map((fee) => fee.slot),
        slotFees: latestSchedule.slotFees,
        upcomingFeeSchedule: null,
      },
      totalSeats: seats.length,
      availableSeats,
      seats: seatData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Public: Student Self-Registration & Seat Booking
 */
router.post('/self-register', async (req, res) => {
  try {
    const {
      libraryId,
      studentName,
      email,
      password,
      contactNo,
      seatNumber,
      slots = ['Full Day (24x7)'],
      address = '',
      fatherName = '',
    } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = normalizePhone(contactNo);

    if (!libraryId || !studentName || !normalizedEmail || !password || !normalizedPhone || !seatNumber) {
      return res.status(400).json({ success: false, message: 'Required booking fields missing' });
    }

    const library = await Library.findOne({ _id: libraryId, isDemo: { $ne: true } });
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    // Check if email already registered
    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { phone: { $in: phoneLookupVariants(normalizedPhone) } },
      ],
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === normalizedEmail
          ? 'This email is already registered. Please sign in.'
          : 'This mobile number is already registered.',
      });
    }

    const selectedSlots = Array.isArray(slots) && slots.length > 0 ? slots : ['Full Day (24x7)'];
    const activeSchedule = getActiveFeeSchedule(library);
    const availableSlots = new Set(activeSchedule.slotFees.map((fee) => fee.slot));
    if (
      selectedSlots.some((slot) => !availableSlots.has(slot))
      || new Set(selectedSlots).size !== selectedSlots.length
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid time slots for this library.',
      });
    }

    const shiftSummary = selectedSlots.join(' + ');

    // Check if seat is already occupied for these slots
    const isFullDay = selectedSlots.some((s) => s.includes('Full Day'));
    const conflictQuery = {
      libraryId,
      seatNumber,
      status: 'Active',
    };

    if (isFullDay) {
      conflictQuery.$or = [{ status: 'Active' }];
    } else {
      conflictQuery.$or = [
        { shift: { $regex: 'Full Day', $options: 'i' } },
        { slots: { $in: selectedSlots } },
      ];
    }

    const existingStudentOnSeat = await Student.findOne(conflictQuery);
    if (existingStudentOnSeat) {
      return res.status(400).json({
        success: false,
        message: `Seat ${seatNumber} has already been booked for ${existingStudentOnSeat.shift}. Please select another seat.`,
      });
    }

    // Calculate monthly fee (base fee or proportional for slots)
    const monthlyFee = calculateMonthlyFee(library, selectedSlots);

    // 1. Create Student record
    const student = await Student.create({
      libraryId,
      studentName,
      seatNumber,
      shift: shiftSummary,
      slots: selectedSlots,
      contactNo: normalizedPhone,
      email: normalizedEmail,
      fatherName,
      address,
      joiningDate: new Date(),
      monthlyFee,
      status: 'Active',
    });

    // 2. Create Student User account
    const user = await User.create({
      libraryId,
      studentProfileId: student._id,
      name: studentName,
      email: normalizedEmail,
      password,
      role: 'student',
      phone: normalizedPhone,
      emailVerified: false,
    });

    // 3. Mark Seat as Occupied
    await Seat.findOneAndUpdate(
      { libraryId, seatNumber },
      {
        status: 'Occupied',
        assignedStudentId: student._id,
        currentStudentName: studentName,
        currentShift: shiftSummary,
      },
      { upsert: true }
    );

    // 4. Create initial month fee ledger
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    await FeePayment.create({
      libraryId,
      studentId: student._id,
      month: currentMonth,
      year: currentYear,
      amountDue: monthlyFee,
      amountPaid: 0,
      balance: monthlyFee,
      status: 'Due',
      dueDate: new Date(currentYear, currentMonth - 1, library.settings?.dueDayOfMonth || 5),
    });

    try {
      await sendOtp({ user, purpose: 'verify_email' });
    } catch (error) {
      return res.status(error.status || 503).json({
        success: false,
        verificationRequired: true,
        email: user.email,
        message: `Account created, but the verification code could not be sent. ${error.message}`,
      });
    }

    return res.status(202).json({
      success: true,
      verificationRequired: true,
      email: user.email,
      message: `Seat ${seatNumber} is reserved at ${library.name}. Verify your email to finish registration and sign in.`,
    });
  } catch (err) {
    console.error('Self-registration error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
