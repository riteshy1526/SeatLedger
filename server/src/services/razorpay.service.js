const Razorpay = require('razorpay');
const crypto = require('crypto');

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const isConfigured = Boolean(KEY_ID && KEY_SECRET);
const paymentMode = !isConfigured
  ? 'unconfigured'
  : KEY_ID.startsWith('rzp_test_')
    ? 'test'
    : 'live';
const ROUTE_ACCOUNT_COOLING_PERIOD_SECONDS = 24 * 60 * 60;

const razorpayInstance = isConfigured
  ? new Razorpay({
    key_id: KEY_ID,
    key_secret: KEY_SECRET,
  })
  : null;

const getRouteReferenceId = (libraryId) => `seatledger_${libraryId.toString()}`;

const createRouteError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateRouteLinkedAccount = (account, expectedReferenceId) => {
  if (account.reference_id !== expectedReferenceId) {
    throw createRouteError('This Linked Account is not registered to this library.');
  }
  if (account.type !== 'route') {
    throw createRouteError('Connect a Razorpay Route Linked Account.');
  }
  if (account.status !== 'activated' || !account.activated_at) {
    throw createRouteError('Complete Razorpay Route onboarding before connecting this account.', 409);
  }
  if (account.hold_funds) {
    throw createRouteError('This Razorpay Linked Account is on settlement hold.', 409);
  }
  if (!Number.isFinite(Number(account.created_at)) || Number(account.created_at) <= 0) {
    throw createRouteError('Razorpay returned an invalid Linked Account creation date.', 502);
  }

  return account;
};

const verifyRouteLinkedAccount = async (accountId, expectedReferenceId) => {
  if (!isConfigured || !razorpayInstance) {
    throw createRouteError('Razorpay is not configured on the server.', 503);
  }
  if (!/^acc_[A-Za-z0-9]+$/.test(accountId)) {
    throw createRouteError('Enter a valid Razorpay Linked Account ID.');
  }

  let account;
  try {
    account = await razorpayInstance.accounts.fetch(accountId);
  } catch (error) {
    const description = error.error?.description;
    throw createRouteError(
      description || 'Razorpay could not verify this Linked Account ID.',
      error.statusCode || 502
    );
  }

  return validateRouteLinkedAccount(account, expectedReferenceId);
};

const isRouteLinkedAccountTransferReady = (account) => {
  const createdAt = Number(account?.created_at);
  return Number.isFinite(createdAt)
    && createdAt > 0
    && Date.now() >= (createdAt + ROUTE_ACCOUNT_COOLING_PERIOD_SECONDS) * 1000;
};

const buildRouteTransfer = ({ accountId, amountPaise, feeId, libraryName, monthYear }) => ({
  account: accountId,
  amount: amountPaise,
  currency: 'INR',
  notes: {
    feeId: feeId.toString(),
    libraryName,
    monthYear,
  },
  linked_account_notes: ['libraryName', 'monthYear'],
  on_hold: false,
});

/**
 * Create a new payment order
 * @param {number} amount in Rupees (will be multiplied by 100 for paise)
 * @param {string} receipt
 * @param {object} notes
 */
const createOrder = async ({
  amount,
  receipt,
  notes = {},
  linkedAccountId,
  transferNotes,
}) => {
  if (!isConfigured || !razorpayInstance) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  if (!linkedAccountId) {
    throw new Error('A Razorpay Linked Account is required for library fee payments.');
  }

  const amountInPaise = Math.round(amount * 100);
  return razorpayInstance.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: receipt.toString(),
    notes,
    partial_payment: false,
    transfers: [buildRouteTransfer({
      accountId: linkedAccountId,
      amountPaise: amountInPaise,
      ...transferNotes,
    })],
  });
};

const fetchPayment = async (paymentId) => {
  if (!isConfigured || !razorpayInstance) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return razorpayInstance.payments.fetch(paymentId);
};

const capturePayment = async (paymentId, amountPaise) => {
  if (!isConfigured || !razorpayInstance) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return razorpayInstance.payments.capture(paymentId, amountPaise, 'INR');
};

/**
 * Verify payment signature
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature } = {}) => {
  if (!isConfigured || !orderId || !paymentId || !signature) return false;

  try {
    const generatedSignature = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const expected = Buffer.from(generatedSignature, 'hex');
    const received = Buffer.from(signature, 'hex');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
};

/**
 * Verify Webhook Signature
 */
const verifyWebhookSignature = (rawBody, signature, webhookSecret) => {
  const secret = webhookSecret || WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) return false;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const expected = Buffer.from(expectedSignature, 'hex');
    const received = Buffer.from(signature, 'hex');
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  } catch {
    return false;
  }
};

module.exports = {
  createOrder,
  fetchPayment,
  capturePayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  getRouteReferenceId,
  validateRouteLinkedAccount,
  verifyRouteLinkedAccount,
  isRouteLinkedAccountTransferReady,
  buildRouteTransfer,
  KEY_ID,
  isConfigured,
  paymentMode,
};
