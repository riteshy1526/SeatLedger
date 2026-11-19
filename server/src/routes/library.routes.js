const express = require('express');
const Library = require('../models/Library');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');
const Student = require('../models/Student');
const FeePayment = require('../models/FeePayment');
const {
  calculateMonthlyFee,
  getActiveFeeSchedule,
  isScheduleEffective,
  toMonthStart,
} = require('../utils/feePricing');
const {
  getRouteReferenceId,
  verifyRouteLinkedAccount,
} = require('../services/razorpay.service');
const { sendOtp, verifyOtp } = require('../services/authOtp');
const { maskPhone } = require('../utils/sendSms');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

/**
 * Get fee schedule for the current tenant
 */
router.get('/pricing', authenticate, tenantContext, requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    return res.json({
      success: true,
      shifts: library.shifts,
      defaultMonthlyFee: library.defaultMonthlyFee,
      activeSchedule: getActiveFeeSchedule(library),
      schedules: [...(library.feeSchedules || [])]
        .sort((first, second) => new Date(first.effectiveFrom) - new Date(second.effectiveFrom)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Create or update per-slot pricing for the current or a future billing month
 */
router.put('/pricing', authenticate, tenantContext, requireRoles('admin'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const effectiveFrom = toMonthStart(req.body?.effectiveFrom);
    const { slotFees } = req.body || {};
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    if (!effectiveFrom || effectiveFrom < currentMonthStart) {
      return res.status(400).json({
        success: false,
        message: 'Choose the current month or a future month for the fee change.',
      });
    }

    if (!Array.isArray(slotFees) || slotFees.length !== library.shifts.length) {
      return res.status(400).json({
        success: false,
        message: 'Set a monthly fee for every library slot.',
      });
    }

    const expectedSlots = new Set(library.shifts);
    const receivedSlots = new Set();
    for (const entry of slotFees) {
      const monthlyFee = Number(entry?.monthlyFee);
      if (
        !entry
        || !expectedSlots.has(entry.slot)
        || receivedSlots.has(entry.slot)
        || !Number.isFinite(monthlyFee)
        || monthlyFee < 0
      ) {
        return res.status(400).json({
          success: false,
          message: 'Each slot must have one valid, non-negative monthly fee.',
        });
      }
      receivedSlots.add(entry.slot);
    }

    const normalizedFees = slotFees.map(({ slot, monthlyFee }) => ({
      slot,
      monthlyFee: Number(monthlyFee),
    }));
    const effectiveTimestamp = effectiveFrom.getTime();
    const existingIndex = library.feeSchedules.findIndex(
      (schedule) => new Date(schedule.effectiveFrom).getTime() === effectiveTimestamp
    );
    const schedule = { effectiveFrom, slotFees: normalizedFees };

    if (existingIndex >= 0) {
      library.feeSchedules[existingIndex] = schedule;
    } else {
      library.feeSchedules.push(schedule);
    }

    const fullDayFee = normalizedFees.find((f) => /full\s*day/i.test(f.slot))?.monthlyFee ?? normalizedFees[0]?.monthlyFee;
    if (fullDayFee) {
      library.defaultMonthlyFee = fullDayFee;
    }

    await library.save();
    const [existingStudents, futureUnpaidFees] = await Promise.all([
      isScheduleEffective(effectiveFrom, now)
        ? Student.find({ libraryId: req.libraryId })
        : Promise.resolve([]),
      FeePayment.find({
        libraryId: req.libraryId,
        amountPaid: 0,
        $or: [
          { year: { $gt: effectiveFrom.getUTCFullYear() } },
          {
            year: effectiveFrom.getUTCFullYear(),
            month: { $gte: effectiveFrom.getUTCMonth() + 1 },
          },
        ],
      }),
    ]);

    if (isScheduleEffective(effectiveFrom, now)) {
      await Promise.all(existingStudents.filter((student) => !student.monthlyFeeOverride).map(async (student) => {
        student.monthlyFee = calculateMonthlyFee(
          library,
          student.slots?.length ? student.slots : [student.shift]
        );
        await student.save();
      }));
    }

    const futureStudentIds = [...new Set(futureUnpaidFees.map((fee) => fee.studentId.toString()))];
    const futureStudents = await Student.find({ _id: { $in: futureStudentIds }, libraryId: req.libraryId });
    const studentsById = new Map(futureStudents.map((student) => [student._id.toString(), student]));
    let updatedFutureFees = 0;
    await Promise.all(futureUnpaidFees.map(async (fee) => {
      const student = studentsById.get(fee.studentId.toString());
      if (!student) return;
      const monthlyFee = student.monthlyFeeOverride
        ? student.monthlyFee
        : calculateMonthlyFee(
          library,
          student.slots?.length ? student.slots : [student.shift],
          new Date(Date.UTC(fee.year, fee.month - 1, 15))
        );
      if (fee.amountDue !== monthlyFee) {
        fee.amountDue = monthlyFee;
        fee.balance = monthlyFee;
        await fee.save();
        updatedFutureFees += 1;
      }
    }));

    const savedSchedule = library.feeSchedules.find(
      (entry) => new Date(entry.effectiveFrom).getTime() === effectiveTimestamp
    );
    return res.json({
      success: true,
      message: `Slot fees saved for ${req.body.effectiveFrom}.`,
      updatedFutureFees,
      savedSchedule,
      activeSchedule: getActiveFeeSchedule(library),
      schedules: [...library.feeSchedules]
        .sort((first, second) => new Date(first.effectiveFrom) - new Date(second.effectiveFrom)),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get payment details for the current tenant (admin only)
 */
router.get('/payment-settings', authenticate, tenantContext, requireRoles('admin'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId).select('paymentDetails');
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    return res.json({
      success: true,
      paymentDetails: {
        razorpayLinkedAccountId: library.paymentDetails?.razorpayLinkedAccountId || '',
      },
      routeReferenceId: getRouteReferenceId(library._id),
      routeTransferReadyAt: library.paymentDetails?.razorpayTransferReadyAt || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update payment details for the current tenant (admin only)
 */
router.post('/payment-settings/razorpay/send-otp', authenticate, tenantContext, requireRoles('admin'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const linkedAccountId = String(req.body?.razorpayLinkedAccountId || '').trim();
    if (!linkedAccountId) {
      return res.status(400).json({ success: false, message: 'Enter a Razorpay Linked Account ID.' });
    }

    const account = await verifyRouteLinkedAccount(
      linkedAccountId,
      getRouteReferenceId(library._id)
    );
    const destinationPhone = normalizePhone(account.phone);
    if (!destinationPhone) {
      return res.status(400).json({
        success: false,
        message: 'This Razorpay Linked Account does not have a valid mobile number for OTP verification.',
      });
    }
    if (!account.email) {
      return res.status(400).json({
        success: false,
        message: 'This Razorpay Linked Account is missing its registered email address.',
      });
    }

    const destination = String(account.email).trim().toLowerCase();
    const otpResult = await sendOtp({
      email: destination,
      phone: destinationPhone,
      purpose: 'verify_route_account',
      context: `${library._id}:${linkedAccountId}:${destinationPhone}`,
    });
    const response = {
      success: true,
      sentTo: maskPhone(destinationPhone),
      message: otpResult?.simulated
        ? `Development code generated for ${maskPhone(destinationPhone)}.`
        : `Verification code sent by SMS to ${maskPhone(destinationPhone)}.`,
    };
    if (process.env.NODE_ENV !== 'production' && otpResult?.devCode) {
      response.devCode = otpResult.devCode;
    }
    return res.json({
      ...response,
    });
  } catch (err) {
    return res.status(err.statusCode || err.status || 500).json({ success: false, message: err.message });
  }
});

router.post('/payment-settings/razorpay/verify-otp', authenticate, tenantContext, requireRoles('admin'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    const linkedAccountId = String(req.body?.razorpayLinkedAccountId || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Enter the 6-digit verification code.' });
    }

    const account = await verifyRouteLinkedAccount(
      linkedAccountId,
      getRouteReferenceId(library._id)
    );
    const destinationPhone = normalizePhone(account.phone);
    if (!destinationPhone) {
      return res.status(400).json({
        success: false,
        message: 'This Razorpay Linked Account does not have a valid mobile number for OTP verification.',
      });
    }
    if (!account.email) {
      return res.status(400).json({
        success: false,
        message: 'This Razorpay Linked Account is missing its registered email address.',
      });
    }
    await verifyOtp({
      email: String(account.email).trim().toLowerCase(),
      purpose: 'verify_route_account',
      code,
      context: `${library._id}:${linkedAccountId}:${destinationPhone}`,
    });

    const transferReadyAt = new Date((Number(account.created_at) + 24 * 60 * 60) * 1000);
    library.paymentDetails = {
      razorpayLinkedAccountId: linkedAccountId,
      razorpayTransferReadyAt: transferReadyAt,
    };
    await library.save();

    return res.json({
      success: true,
      paymentDetails: { razorpayLinkedAccountId: linkedAccountId },
      routeReferenceId: getRouteReferenceId(library._id),
      routeTransferReadyAt: transferReadyAt,
      message: 'Razorpay Linked Account verified and connected.',
    });
  } catch (err) {
    return res.status(err.statusCode || err.status || 500).json({ success: false, message: err.message });
  }
});

router.delete('/payment-settings/razorpay-account', authenticate, tenantContext, requireRoles('admin'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    library.paymentDetails = {
      razorpayLinkedAccountId: '',
      razorpayTransferReadyAt: null,
    };
    await library.save();
    return res.json({ success: true, message: 'Razorpay Linked Account disconnected.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Get tenant library profile
 */
router.get('/profile', authenticate, tenantContext, async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId).select('-paymentDetails');
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }
    return res.json({ success: true, library });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update library settings (Admin only)
 */
router.put('/profile', authenticate, tenantContext, requireRoles('admin'), async (req, res) => {
  try {
    const { name, city, address, phone, totalSeats, defaultMonthlyFee, shifts, settings } = req.body;
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    if (name) library.name = name;
    if (city) library.city = city;
    if (address !== undefined) library.address = address;
    if (phone !== undefined) library.phone = phone;
    if (totalSeats) library.totalSeats = Number(totalSeats);
    if (defaultMonthlyFee) library.defaultMonthlyFee = Number(defaultMonthlyFee);
    if (shifts && Array.isArray(shifts)) library.shifts = shifts;
    if (settings) library.settings = { ...library.settings, ...settings };

    await library.save();
    return res.json({ success: true, message: 'Library settings updated', library });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Superadmin: List all tenant libraries
 */
router.get('/all', authenticate, requireRoles('superadmin'), async (req, res) => {
  try {
    const libraries = await Library.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: libraries.length, libraries });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
