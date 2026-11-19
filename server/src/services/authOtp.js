const crypto = require('crypto');
const Otp = require('../models/Otp');
const { sendEmail } = require('../utils/sendEmail');
const { maskPhone, sendOtpSms } = require('../utils/sendSms');
const { normalizePhone } = require('../utils/phone');

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_WAIT_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashOtp(email, purpose, code, context = '') {
  const secret = process.env.JWT_SECRET || 'seatledger-local-session-secret';
  const payload = context
    ? `${email}:${purpose}:${context}:${code}`
    : `${email}:${purpose}:${code}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function createOtpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function sendOtp({ user, email: directEmail, phone: directPhone, purpose, context = '' }) {
  const email = String(directEmail || user?.email || '').trim().toLowerCase();
  if (!email) throw createOtpError('Email is required.');
  const phone = purpose === 'verify_route_account'
    ? normalizePhone(directPhone || user?.phone)
    : null;
  if (purpose === 'verify_route_account' && !phone) {
    throw createOtpError('A valid Razorpay Linked Account mobile number is required.');
  }
  const emailCopy = {
    verify_email: {
      subject: 'Verify your SeatLedger email',
      action: 'verify your email address',
    },
    reset_password: {
      subject: 'Reset your SeatLedger password',
      action: 'reset your password',
    },
    verify_route_account: {
      subject: 'Verify your Razorpay Linked Account',
      action: 'verify the Razorpay Linked Account connected to your library',
    },
  }[purpose];
  if (!emailCopy) throw createOtpError('Unsupported verification code purpose.');

  const otpContext = String(context || '');
  const now = new Date();
  let record = await Otp.findOne({ email, purpose });

  if (record && record.expiresAt > now && now - record.lastSentAt < OTP_RESEND_WAIT_MS) {
    const retryAfter = Math.ceil((OTP_RESEND_WAIT_MS - (now - record.lastSentAt)) / 1000);
    throw createOtpError(`Please wait ${retryAfter} seconds before requesting another code.`, 429);
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  if (!record) record = new Otp({ email, userId: user?._id || null, purpose });
  if (user?._id) record.userId = user._id;
  record.context = otpContext;
  record.codeHash = hashOtp(email, purpose, code, otpContext);
  record.attempts = 0;
  record.expiresAt = expiresAt;
  record.lastSentAt = now;
  await record.save();

  try {
    const result = purpose === 'verify_route_account'
      ? await sendOtpSms({ phone, code })
      : await sendEmail({
        to: email,
        subject: emailCopy.subject,
        text: `Your SeatLedger code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        html: `<p>Use this code to ${emailCopy.action}:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request this, ignore this email.</p>`,
      });

    if (result.simulated) {
      if (
        process.env.NODE_ENV === 'production'
        && (process.env.AUTH_OTP_LOG !== 'true' || purpose === 'verify_route_account')
      ) {
        throw new Error(
          purpose === 'verify_route_account'
            ? 'Verification SMS was not sent. Configure MSG91 before connecting a Razorpay account.'
            : 'Authentication email was not sent. Configure SMTP, or set AUTH_OTP_LOG=true only for local development.'
        );
      }
      const destination = purpose === 'verify_route_account' ? maskPhone(phone) : email;
      console.info(`[AUTH OTP - DEVELOPMENT ONLY] ${purpose} code for ${destination}: ${code}`);
      return { simulated: true, devCode: code };
    }
  } catch (error) {
    await Otp.deleteOne({ _id: record._id });
    throw error;
  }
}

async function verifyOtp({ email, purpose, code, context = '' }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const otpContext = String(context || '');
  const record = await Otp.findOne({ email: normalizedEmail, purpose });
  if (!record || record.expiresAt <= new Date()) {
    if (record) await Otp.deleteOne({ _id: record._id });
    throw createOtpError('This code is invalid or expired. Request a new code.');
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: record._id });
    throw createOtpError('Too many incorrect attempts. Request a new code.', 429);
  }
  if (String(record.context || '') !== otpContext) {
    throw createOtpError('This code is not valid for this library account.');
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const received = Buffer.from(hashOtp(normalizedEmail, purpose, String(code || ''), otpContext), 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    record.attempts += 1;
    await record.save();
    throw createOtpError('The code you entered is incorrect.');
  }

  await Otp.deleteOne({ _id: record._id });
}

module.exports = { hashOtp, sendOtp, verifyOtp };
