const express = require('express');
const FeePayment = require('../models/FeePayment');
const Student = require('../models/Student');
const Library = require('../models/Library');
const ReminderLog = require('../models/ReminderLog');
const {
  addReminderJob,
  getReminderSystemStatus,
} = require('../queues/reminderQueue');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');

const router = express.Router();
router.use(authenticate, tenantContext);
const REMINDER_CHANNELS = ['EMAIL', 'WHATSAPP'];

function getPaymentLink(feeId) {
  const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${baseUrl}/pay/${feeId}`;
}

function getChannelSetupError(channel) {
  const status = getReminderSystemStatus();
  const isWhatsApp = channel === 'WHATSAPP';
  const configured = isWhatsApp ? status.whatsAppConfigured : status.emailConfigured;
  const missing = isWhatsApp
    ? status.whatsAppMissingConfiguration
    : status.emailMissingConfiguration;

  if (configured) return null;
  return {
    success: false,
    message: `${channel} provider is not configured. Add the required variables to server/.env and restart the backend.`,
    missingConfiguration: missing,
  };
}

/**
 * Send reminder for a single student / fee record
 */
router.post('/send-single', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const { studentId, feeId, channel = 'WHATSAPP' } = req.body;
    if (!REMINDER_CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be EMAIL or WHATSAPP' });
    }
    const setupError = getChannelSetupError(channel);
    if (setupError) return res.status(503).json(setupError);

    const student = await Student.findOne({ _id: studentId, libraryId: req.libraryId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (student.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Reminders can only be sent to active students' });
    }

    const fee = await FeePayment.findOne({ _id: feeId, studentId, libraryId: req.libraryId });
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }
    if (!['Due', 'Partial'].includes(fee.status) || fee.balance <= 0) {
      return res.status(400).json({ success: false, message: 'Only unpaid fee records can be reminded' });
    }

    const library = await Library.findById(req.libraryId);
    const contact = channel === 'EMAIL' ? student.email : student.contactNo;

    if (!contact) {
      return res.status(400).json({
        success: false,
        message: `Student does not have a registered ${channel === 'EMAIL' ? 'email' : 'phone number'}`,
      });
    }

    const dueDateFormatted = new Date(fee.dueDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

    const job = await addReminderJob({
      libraryId: req.libraryId,
      studentId: student._id,
      feeId: fee._id,
      studentName: student.studentName,
      channel,
      contact,
      amount: fee.balance,
      dueDate: dueDateFormatted,
      libraryName: library?.name || 'SeatLedger Library',
      paymentLink: getPaymentLink(fee._id),
    });

    return res.json({
      success: true,
      message: `${channel} reminder queued successfully via ${job.type}`,
      job,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Bulk send due reminders for all students with pending fees
 */
router.post('/send-bulk-due', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const { month, year, channel = 'WHATSAPP' } = req.body;
    if (!REMINDER_CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be EMAIL or WHATSAPP' });
    }
    const setupError = getChannelSetupError(channel);
    if (setupError) return res.status(503).json(setupError);

    const now = new Date();
    const targetMonth = parseInt(month || (now.getMonth() + 1));
    const targetYear = parseInt(year || now.getFullYear());

    const dueFees = await FeePayment.find({
      libraryId: req.libraryId,
      month: targetMonth,
      year: targetYear,
      status: { $in: ['Due', 'Partial'] },
      balance: { $gt: 0 },
    }).populate('studentId');

    const library = await Library.findById(req.libraryId);
    let queuedCount = 0;

    for (const fee of dueFees) {
      const student = fee.studentId;
      if (!student || student.status !== 'Active') continue;

      const contact = channel === 'EMAIL' ? student.email : student.contactNo;
      if (!contact) continue;

      const dueDateFormatted = new Date(fee.dueDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });

      await addReminderJob({
        libraryId: req.libraryId,
        studentId: student._id,
        feeId: fee._id,
        studentName: student.studentName,
        channel,
        contact,
        amount: fee.balance,
        dueDate: dueDateFormatted,
        libraryName: library?.name || 'SeatLedger Library',
        paymentLink: getPaymentLink(fee._id),
      });

      queuedCount++;
    }

    return res.json({
      success: true,
      message: `Enqueued ${queuedCount} ${channel} reminders for ${targetMonth}/${targetYear}`,
      queuedCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId);
    if (!library) {
      return res.status(404).json({ success: false, message: 'Library not found' });
    }

    return res.json({
      success: true,
      schedule: {
        time: '09:00',
        timeZone: 'Asia/Kolkata',
        daysBeforeDue: library.settings?.reminderDaysBeforeDue ?? 3,
        emailEnabled: library.settings?.enableEmailReminder !== false,
        whatsAppEnabled: library.settings?.enableWhatsappReminder !== false,
      },
      ...getReminderSystemStatus(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get reminder audit logs
 */
router.get('/logs', async (req, res) => {
  try {
    const logs = await ReminderLog.find({ libraryId: req.libraryId })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
