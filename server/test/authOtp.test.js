const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { hashOtp } = require('../src/services/authOtp');

test('preserves the existing OTP hash format when no context is provided', () => {
  const secret = process.env.JWT_SECRET || 'seatledger-local-session-secret';
  const expected = crypto
    .createHmac('sha256', secret)
    .update('admin@example.com:verify_email:123456')
    .digest('hex');

  assert.equal(hashOtp('admin@example.com', 'verify_email', '123456'), expected);
});

test('binds a Razorpay verification code to its library and linked account', () => {
  const first = hashOtp('admin@example.com', 'verify_route_account', '123456', 'library1:acc_1');
  const otherLibrary = hashOtp('admin@example.com', 'verify_route_account', '123456', 'library2:acc_1');
  const otherAccount = hashOtp('admin@example.com', 'verify_route_account', '123456', 'library1:acc_2');
  const otherMobile = hashOtp('admin@example.com', 'verify_route_account', '123456', 'library1:acc_1:+919876543210');

  assert.notEqual(first, otherLibrary);
  assert.notEqual(first, otherAccount);
  assert.notEqual(
    hashOtp('admin@example.com', 'verify_route_account', '123456', 'library1:acc_1:+919876543211'),
    otherMobile
  );
});
