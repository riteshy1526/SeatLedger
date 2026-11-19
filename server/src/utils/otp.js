const speakeasy = require('speakeasy');
const crypto = require('crypto');

// -------------------------------------------------
// Generate a 6‑digit numeric OTP and a SHA‑256 hash
// -------------------------------------------------
function generateOtp() {
    const otp = speakeasy.totp({
        secret: crypto.randomBytes(20).toString('hex'),
        encoding: 'base32',
        digits: 6,
        step: 300               // 5‑minute validity window
    });
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    return { otp, hash };
}

// -------------------------------------------------
// Verify a plain OTP against the stored hash
// -------------------------------------------------
function verifyOtp(plainOtp, storedHash) {
    const hash = crypto.createHash('sha256').update(plainOtp).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

module.exports = { generateOtp, verifyOtp };