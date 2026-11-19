const express = require('express');
const FeePayment = require('../models/FeePayment');
const Student = require('../models/Student');
const Library = require('../models/Library');
const {
  createOrder,
  fetchPayment,
  capturePayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  KEY_ID,
  isConfigured,
  paymentMode,
  getRouteReferenceId,
  verifyRouteLinkedAccount,
  isRouteLinkedAccountTransferReady,
} = require('../services/razorpay.service');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');

const router = express.Router();

router.get('/config', authenticate, tenantContext, requireRoles('student'), async (req, res) => {
  try {
    const library = await Library.findById(req.libraryId).select('paymentDetails.razorpayLinkedAccountId');
    const hasLinkedAccount = Boolean(library?.paymentDetails?.razorpayLinkedAccountId);
    return res.json({
      success: true,
      enabled: isConfigured && hasLinkedAccount,
      mode: paymentMode,
      receiver: 'library',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Create a Razorpay Order for a student fee
 */
router.post('/create-order', authenticate, tenantContext, requireRoles('student'), async (req, res) => {
  try {
    if (!isConfigured) {
      return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    }

    const { feeId } = req.body;
    if (!feeId) {
      return res.status(400).json({ success: false, message: 'feeId is required' });
    }

    const fee = await FeePayment.findOne({ _id: feeId, libraryId: req.libraryId }).populate('studentId');
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }

    if (fee.status === 'Paid' || fee.balance <= 0) {
      return res.status(400).json({ success: false, message: 'Fee is already fully paid' });
    }
    if (fee.studentId?._id?.toString() !== req.user.studentProfileId) {
      return res.status(403).json({ success: false, message: 'You can only pay your own fees.' });
    }

    const library = await Library.findById(req.libraryId);
    const linkedAccountId = library?.paymentDetails?.razorpayLinkedAccountId;
    if (!linkedAccountId) {
      return res.status(503).json({
        success: false,
        message: 'Your library has not connected a Razorpay Route Linked Account yet.',
      });
    }
    const routeAccount = await verifyRouteLinkedAccount(
      linkedAccountId,
      getRouteReferenceId(library._id)
    );
    if (!isRouteLinkedAccountTransferReady(routeAccount)) {
      return res.status(409).json({
        success: false,
        message: 'Razorpay Route transfers are available 24 hours after the Linked Account is created.',
      });
    }

    // Create Razorpay Order
    const order = await createOrder({
      amount: fee.balance,
      receipt: `rec_${fee._id.toString().slice(-8)}`,
      linkedAccountId,
      transferNotes: {
        feeId: fee._id,
        libraryName: library?.name || 'SeatLedger Library',
        monthYear: `${fee.month}/${fee.year}`,
      },
      notes: {
        feeId: fee._id.toString(),
        studentId: fee.studentId?._id?.toString() || '',
        studentName: fee.studentId?.studentName || '',
        libraryName: library?.name || 'SeatLedger Library',
        monthYear: `${fee.month}/${fee.year}`,
      },
    });

    // Save order id in fee
    fee.razorpayOrderId = order.id;
    await fee.save();

    return res.json({
      success: true,
      order,
      keyId: KEY_ID,
      paymentMode,
      student: {
        name: fee.studentId?.studentName,
        email: fee.studentId?.email,
        contact: fee.studentId?.contactNo,
      },
      libraryName: library?.name,
    });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

/**
 * Verify Razorpay payment signature and mark fee as paid
 */
router.post('/verify', authenticate, tenantContext, requireRoles('student'), async (req, res) => {
  try {
    const { feeId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!feeId || !razorpayOrderId || !razorpayPaymentId) {
      return res.status(400).json({ success: false, message: 'Missing payment verification params' });
    }

    const fee = await FeePayment.findOne({ _id: feeId, libraryId: req.libraryId });
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }
    if (fee.studentId.toString() !== req.user.studentProfileId) {
      return res.status(403).json({ success: false, message: 'You can only pay your own fees.' });
    }
    if (fee.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ success: false, message: 'Payment order does not match this fee.' });
    }
    if (fee.status === 'Paid') {
      return res.json({ success: true, message: 'Payment was already recorded.', fee });
    }

    const isValid = verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Payment verification failed: Invalid signature.' });
    }

    const expectedAmount = Math.round(fee.balance * 100);
    let payment = await fetchPayment(razorpayPaymentId);
    if (
      payment.order_id !== razorpayOrderId
      || payment.amount !== expectedAmount
      || payment.currency !== 'INR'
    ) {
      return res.status(400).json({ success: false, message: 'Payment amount or order does not match this fee.' });
    }
    if (payment.status === 'authorized') {
      payment = await capturePayment(razorpayPaymentId, expectedAmount);
    }
    if (payment.status !== 'captured') {
      return res.status(409).json({
        success: false,
        message: 'Payment has not been captured yet. Please wait a moment and refresh your fee history.',
      });
    }

    fee.amountPaid = fee.amountDue;
    fee.balance = 0;
    fee.status = 'Paid';
    fee.paymentDate = new Date();
    fee.paymentMethod = 'Razorpay';
    fee.razorpayOrderId = razorpayOrderId;
    fee.razorpayPaymentId = razorpayPaymentId;
    fee.razorpaySignature = razorpaySignature;

    await fee.save();

    return res.json({
      success: true,
      message: 'Payment verified and recorded successfully!',
      fee,
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Webhook handler for Razorpay asynchronous payment events
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ status: 'invalid body' });
    }
    const rawBody = req.body;

    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      return res.status(400).json({ status: 'invalid signature' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity;
      if (!paymentEntity?.order_id || !paymentEntity?.id) {
        return res.status(400).json({ status: 'invalid payment event' });
      }
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      const fee = await FeePayment.findOne({ razorpayOrderId: orderId });
      if (fee && fee.status !== 'Paid') {
        if (paymentEntity.currency !== 'INR' || paymentEntity.amount !== Math.round(fee.balance * 100)) {
          return res.status(400).json({ status: 'payment amount does not match fee balance' });
        }
        fee.amountPaid = fee.amountDue;
        fee.balance = 0;
        fee.status = 'Paid';
        fee.paymentDate = new Date();
        fee.paymentMethod = 'Razorpay';
        fee.razorpayPaymentId = paymentId;
        await fee.save();
        console.log(`[Razorpay Webhook] Successfully marked fee ${fee._id} as Paid via webhook`);
      }
    }

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
