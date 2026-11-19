
const express = require('express');
const FeePayment = require('../models/FeePayment');
const Student = require('../models/Student');
const Library = require('../models/Library');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');
const {
  calculateMonthlyFee,
  repriceFeeRecord,
  resetFeePayment,
  syncStudentMonthlyFee,
} = require('../utils/feePricing');
const { ensureMonthlyFeeRecords } = require('../utils/monthlyFeeProvisioning');

const router = express.Router();
router.use(authenticate, tenantContext);

/**
 * Get monthly fee records
 */
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.query.month || (now.getMonth() + 1));
    const year = parseInt(req.query.year || now.getFullYear());
    const status = req.query.status || 'All';

    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }
    await ensureMonthlyFeeRecords(req.libraryId, library, month, year);

    const filter = { libraryId: req.libraryId, month, year };
    if (status !== 'All') {
      filter.status = status;
    }

    const fees = await FeePayment.find(filter)
      .populate('studentId', 'studentName seatNumber contactNo email shift monthlyFee status')
      .sort({ createdAt: -1 });

    return res.json({ success: true, count: fees.length, month, year, fees });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Update a student's current and future monthly fee from the fee ledger
 */
router.put('/:feeId/monthly-fee', requireRoles('admin'), async (req, res) => {
  try {
    const amount = Number(req.body.monthlyFee);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: 'Monthly fee must be a non-negative number.' });
    }

    const fee = await FeePayment.findOne({ _id: req.params.feeId, libraryId: req.libraryId });
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found.' });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    if (fee.month !== currentMonth || fee.year !== currentYear) {
      return res.status(400).json({ success: false, message: 'Only the current month fee can be edited here.' });
    }
    if (fee.status === 'Paid') {
      return res.status(400).json({ success: false, message: 'A paid fee record cannot be changed.' });
    }

    const student = await Student.findOne({ _id: fee.studentId, libraryId: req.libraryId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    student.monthlyFee = amount;
    student.monthlyFeeOverride = true;
    await student.save();

    repriceFeeRecord(fee, amount);
    await fee.save();

    const nextMonth = new Date(currentYear, currentMonth, 1);
    const futureFees = await FeePayment.find({
      libraryId: req.libraryId,
      studentId: student._id,
      amountPaid: 0,
      $or: [
        { year: { $gt: nextMonth.getFullYear() } },
        { year: nextMonth.getFullYear(), month: { $gte: nextMonth.getMonth() + 1 } },
      ],
    });
    await Promise.all(futureFees.map(async (futureFee) => {
      repriceFeeRecord(futureFee, amount);
      await futureFee.save();
    }));

    return res.json({
      success: true,
      message: 'Monthly fee updated for the student and unpaid future fee records.',
      fee,
      student,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Correct a manually recorded payment that was marked paid by mistake
 */
router.put('/:feeId/mark-unpaid', requireRoles('admin'), async (req, res) => {
  try {
    const fee = await FeePayment.findOne({ _id: req.params.feeId, libraryId: req.libraryId });
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found.' });
    }
    if (fee.status !== 'Paid') {
      return res.status(400).json({ success: false, message: 'Only paid fee records can be reset to due.' });
    }
    if (fee.paymentMethod === 'Razorpay' || fee.razorpayPaymentId) {
      return res.status(409).json({
        success: false,
        message: 'This fee was paid through Razorpay. Refund the payment before changing its status.',
      });
    }

    resetFeePayment(fee);
    await fee.save();
    return res.json({ success: true, message: 'Payment corrected; fee is now due again.', fee });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Auto-generate monthly fees for all active students for given month & year
 */
router.post('/generate-monthly', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const now = new Date();
    const month = parseInt(req.body.month || (now.getMonth() + 1));
    const year = parseInt(req.body.year || now.getFullYear());

    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }
    const dueDay = library?.settings?.dueDayOfMonth || 5;
    const feeMonth = new Date(year, month - 1, 15);
    const dueDate = new Date(year, month - 1, dueDay);

    const activeStudents = await Student.find({ libraryId: req.libraryId, status: 'Active' });
    let createdCount = 0;

    for (const st of activeStudents) {
      const monthlyFee = st.monthlyFeeOverride
        ? st.monthlyFee
        : calculateMonthlyFee(
          library,
          st.slots?.length ? st.slots : [st.shift],
          feeMonth
        );
      await syncStudentMonthlyFee(st, library);
      const existing = await FeePayment.findOne({
        libraryId: req.libraryId,
        studentId: st._id,
        month,
        year,
      });

      if (!existing) {
        await FeePayment.create({
          libraryId: req.libraryId,
          studentId: st._id,
          month,
          year,
          amountDue: monthlyFee,
          amountPaid: 0,
          balance: monthlyFee,
          status: 'Due',
          dueDate,
        });
        createdCount++;
      }
    }

    return res.json({
      success: true,
      message: `Generated fee records for ${createdCount} students for ${month}/${year}`,
      createdCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Collect offline cash/UPI payment
 */
router.post('/collect-offline', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const { feeId, amountPaid, paymentMethod = 'Cash', notes = '' } = req.body;
    if (!feeId || amountPaid === undefined) {
      return res.status(400).json({ success: false, message: 'feeId and amountPaid are required' });
    }

    const fee = await FeePayment.findOne({ _id: feeId, libraryId: req.libraryId });
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }

    const newAmountPaid = (fee.amountPaid || 0) + Number(amountPaid);
    const newBalance = Math.max(0, fee.amountDue - newAmountPaid);
    const newStatus = newBalance === 0 ? 'Paid' : newAmountPaid > 0 ? 'Partial' : 'Due';

    fee.amountPaid = newAmountPaid;
    fee.balance = newBalance;
    fee.status = newStatus;
    fee.paymentDate = new Date();
    fee.paymentMethod = paymentMethod;
    if (notes) fee.notes = notes;

    await fee.save();

    return res.json({ success: true, message: 'Payment recorded successfully', fee });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get fee ledger for a specific student (Used in Student Portal)
 */
router.get('/student/:studentId', async (req, res) => {
  try {
    if (
      req.user.role === 'student'
      && req.user.studentProfileId !== req.params.studentId
    ) {
      return res.status(403).json({ success: false, message: 'You can only view your own fee history.' });
    }

    const fees = await FeePayment.find({
      studentId: req.params.studentId,
      libraryId: req.libraryId,
    }).sort({ year: -1, month: -1 });

    return res.json({ success: true, fees });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
