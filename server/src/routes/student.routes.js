const express = require('express');
const Student = require('../models/Student');
const Seat = require('../models/Seat');
const FeePayment = require('../models/FeePayment');
const User = require('../models/User');
const Library = require('../models/Library');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');
const {
  calculateMonthlyFee,
  getUpcomingFeeSchedule,
  syncStudentMonthlyFee,
} = require('../utils/feePricing');
const { syncSeatForActiveStudents } = require('../utils/studentSeatSync');

const router = express.Router();

// All student routes require auth and tenant context
router.use(authenticate, tenantContext);

/**
 * List students for current library tenant
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'All', search = '', shift = 'All', page = 1, limit = 50 } = req.query;

    const filter = { libraryId: req.libraryId };

    if (status !== 'All') {
      filter.status = status;
    }

    if (shift !== 'All') {
      filter.shift = shift;
    }

    if (search.trim()) {
      filter.$or = [
        { studentName: { $regex: search.trim(), $options: 'i' } },
        { seatNumber: { $regex: search.trim(), $options: 'i' } },
        { contactNo: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const students = await Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const library = await Library.findById(req.libraryId);
    let responseStudents = students;
    if (library) {
      await Promise.all(students.map((student) => syncStudentMonthlyFee(student, library)));
      const upcomingSchedule = getUpcomingFeeSchedule(library);
      if (upcomingSchedule) {
        responseStudents = students.map((student) => ({
          ...student.toObject(),
          upcomingMonthlyFee: student.monthlyFeeOverride
            ? student.monthlyFee
            : calculateMonthlyFee(
              library,
              student.slots?.length ? student.slots : [student.shift],
              upcomingSchedule.effectiveFrom
            ),
          upcomingFeeEffectiveFrom: upcomingSchedule.effectiveFrom,
        }));
      }
    }

    const total = await Student.countDocuments(filter);

    return res.json({
      success: true,
      students: responseStudents,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get student by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, libraryId: req.libraryId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in this library' });
    }

    const library = await Library.findById(req.libraryId);
    let studentData = student;
    if (library) {
      await syncStudentMonthlyFee(student, library);
      const upcomingSchedule = getUpcomingFeeSchedule(library);
      if (upcomingSchedule) {
        studentData = {
          ...student.toObject(),
          upcomingMonthlyFee: student.monthlyFeeOverride
            ? student.monthlyFee
            : calculateMonthlyFee(
              library,
              student.slots?.length ? student.slots : [student.shift],
              upcomingSchedule.effectiveFrom
            ),
          upcomingFeeEffectiveFrom: upcomingSchedule.effectiveFrom,
        };
      }
    }

    const fees = await FeePayment.find({ studentId: student._id, libraryId: req.libraryId }).sort({
      year: -1,
      month: -1,
    });

    return res.json({ success: true, student: studentData, fees });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Add a new student
 */
router.post('/', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const {
      studentName,
      seatNumber,
      shift,
      slots,
      contactNo,
      email = '',
      fatherName = '',
      address = '',
      joiningDate = new Date(),
    } = req.body;

    if (!studentName || !seatNumber || !contactNo) {
      return res.status(400).json({ success: false, message: 'studentName, seatNumber, and contactNo are required' });
    }

    const selectedSlots = Array.isArray(slots) && slots.length > 0
      ? slots
      : [shift || 'Full Day (24x7)'];
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }
    const validSlots = new Set(library.shifts);
    if (
      selectedSlots.some((slot) => !validSlots.has(slot))
      || new Set(selectedSlots).size !== selectedSlots.length
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please select valid time slots configured for this library.',
      });
    }
    const monthlyFee = calculateMonthlyFee(library, selectedSlots);
    const shiftSummary = selectedSlots.join(' + ');

    // Check if seat is already occupied for any of the requested slots
    const isFullDay = selectedSlots.some((s) => s.includes('Full Day'));
    const conflictQuery = {
      libraryId: req.libraryId,
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
        message: `Seat ${seatNumber} is already occupied by ${existingStudentOnSeat.studentName} for slot(s): ${existingStudentOnSeat.shift}`,
      });
    }

    const student = await Student.create({
      libraryId: req.libraryId,
      studentName,
      seatNumber,
      shift: shiftSummary,
      slots: selectedSlots,
      contactNo,
      email,
      fatherName,
      address,
      joiningDate: new Date(joiningDate),
      monthlyFee: Number(monthlyFee),
      status: 'Active',
    });

    // Update Seat Status and push bookedSlots in Seat Collection
    const slotEntries = selectedSlots.map((s) => ({
      slot: s,
      studentId: student._id,
      studentName: student.studentName,
    }));

    await Seat.findOneAndUpdate(
      { libraryId: req.libraryId, seatNumber },
      {
        status: 'Occupied',
        assignedStudentId: student._id,
        currentStudentName: student.studentName,
        currentShift: shiftSummary,
        $push: { bookedSlots: { $each: slotEntries } },
      },
      { upsert: true }
    );

    // Auto-create initial fee payment for current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    await FeePayment.create({
      libraryId: req.libraryId,
      studentId: student._id,
      month: currentMonth,
      year: currentYear,
      amountDue: Number(monthlyFee),
      amountPaid: 0,
      balance: Number(monthlyFee),
      status: 'Due',
      dueDate: new Date(currentYear, currentMonth - 1, library.settings?.dueDayOfMonth || 5),
    });

    return res.status(201).json({ success: true, message: 'Student registered successfully', student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update student
 */
router.put('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, libraryId: req.libraryId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const {
      studentName,
      seatNumber,
      shift,
      contactNo,
      email,
      fatherName,
      address,
      slots,
      monthlyFee,
      monthlyFeeOverride,
      status,
    } = req.body;

    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const selectedSlots = Array.isArray(slots) && slots.length > 0
      ? slots
      : (shift ? [shift] : student.slots);
    if (
      selectedSlots.some((slot) => !library.shifts.includes(slot))
      || new Set(selectedSlots).size !== selectedSlots.length
    ) {
      return res.status(400).json({ success: false, message: 'Please select valid library slots.' });
    }

    if (monthlyFeeOverride && (!Number.isFinite(Number(monthlyFee)) || Number(monthlyFee) < 0)) {
      return res.status(400).json({ success: false, message: 'Monthly fee must be a non-negative number.' });
    }

    const targetSeatNumber = seatNumber || student.seatNumber;
    const targetStatus = status || student.status;
    if (targetStatus === 'Active') {
      const requestedFullDay = selectedSlots.some((slot) => /full\s*day/i.test(slot));
      const conflictingStudents = await Student.find({
        libraryId: req.libraryId,
        seatNumber: targetSeatNumber,
        status: 'Active',
        _id: { $ne: student._id },
      }).select('studentName shift slots');
      const conflict = conflictingStudents.find((otherStudent) => (
        requestedFullDay
        || (otherStudent.slots || [otherStudent.shift]).some((slot) => (
          /full\s*day/i.test(slot) || selectedSlots.includes(slot)
        ))
      ));
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `Seat ${targetSeatNumber} conflicts with ${conflict.studentName}'s selected slot.`,
        });
      }
    }

    const linkedUser = await User.findOne({ studentProfileId: student._id, libraryId: req.libraryId });
    const normalizedEmail = email === undefined ? student.email : String(email).trim().toLowerCase();
    if (linkedUser && !normalizedEmail) {
      return res.status(400).json({ success: false, message: 'A student portal account must have an email address.' });
    }
    if (normalizedEmail && linkedUser) {
      const duplicateEmail = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: linkedUser._id },
      });
      if (duplicateEmail) {
        return res.status(409).json({ success: false, message: 'This email is already used by another account.' });
      }
    }

    const oldSeat = student.seatNumber;

    if (studentName) student.studentName = studentName;
    if (seatNumber) student.seatNumber = seatNumber;
    if (slots !== undefined || shift) {
      student.slots = selectedSlots;
      student.shift = selectedSlots.join(' + ');
    }
    if (contactNo) student.contactNo = contactNo;
    if (email !== undefined) student.email = normalizedEmail;
    if (fatherName !== undefined) student.fatherName = fatherName;
    if (address !== undefined) student.address = address;
    if (monthlyFeeOverride) {
      student.monthlyFee = Number(monthlyFee);
      student.monthlyFeeOverride = true;
    } else {
      student.monthlyFee = calculateMonthlyFee(library, selectedSlots);
      student.monthlyFeeOverride = false;
    }
    if (status) student.status = status;

    await student.save();

    if (linkedUser) {
      linkedUser.name = student.studentName;
      linkedUser.email = student.email;
      linkedUser.phone = student.contactNo;
      await linkedUser.save();
    }

    const nextMonth = new Date();
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const unpaidFutureFees = await FeePayment.find({
      libraryId: req.libraryId,
      studentId: student._id,
      amountPaid: 0,
      $or: [
        { year: { $gt: nextMonth.getFullYear() } },
        { year: nextMonth.getFullYear(), month: { $gte: nextMonth.getMonth() + 1 } },
      ],
    });
    await Promise.all(unpaidFutureFees.map(async (fee) => {
      const monthlyAmount = student.monthlyFeeOverride
        ? student.monthlyFee
        : calculateMonthlyFee(
          library,
          student.slots,
          new Date(Date.UTC(fee.year, fee.month - 1, 15))
        );
      fee.amountDue = monthlyAmount;
      fee.balance = monthlyAmount;
      await fee.save();
    }));

    const affectedSeats = [...new Set([oldSeat, student.seatNumber])];
    for (const affectedSeat of affectedSeats) {
      await syncSeatForActiveStudents(Student, Seat, req.libraryId, affectedSeat);
    }

    return res.json({ success: true, message: 'Student updated successfully', student });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Put a student on a temporary break or reactivate them
 */
router.patch('/:id/status', requireRoles('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Choose Active or Inactive status.' });
    }

    const student = await Student.findOne({ _id: req.params.id, libraryId: req.libraryId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (status === 'Active' && student.status !== 'Active') {
      const selectedSlots = student.slots?.length ? student.slots : [student.shift];
      const requestedFullDay = selectedSlots.some((slot) => /full\s*day/i.test(slot));
      const otherStudents = await Student.find({
        libraryId: req.libraryId,
        seatNumber: student.seatNumber,
        status: 'Active',
        _id: { $ne: student._id },
      }).select('studentName shift slots');
      const conflict = otherStudents.find((otherStudent) => (
        requestedFullDay
        || (otherStudent.slots || [otherStudent.shift]).some((slot) => (
          /full\s*day/i.test(slot) || selectedSlots.includes(slot)
        ))
      ));
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `Seat ${student.seatNumber} is now assigned to ${conflict.studentName}. Choose another seat before resuming.`,
        });
      }
    }

    student.status = status;
    await student.save();
    await syncSeatForActiveStudents(Student, Seat, req.libraryId, student.seatNumber);

    return res.json({
      success: true,
      message: status === 'Inactive'
        ? 'Student paused; their seat is now available.'
        : 'Student resumed and seat availability updated.',
      student,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Delete student
 */
router.delete('/:id', requireRoles('admin'), async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, libraryId: req.libraryId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const deleted = await Student.deleteOne({ _id: student._id, libraryId: req.libraryId });
    if (deleted.deletedCount !== 1) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    await Promise.all([
      FeePayment.deleteMany({ studentId: student._id, libraryId: req.libraryId }),
      User.deleteMany({ studentProfileId: student._id, libraryId: req.libraryId }),
    ]);
    await syncSeatForActiveStudents(Student, Seat, req.libraryId, student.seatNumber);

    return res.json({ success: true, message: 'Student, linked account, and fee history removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
