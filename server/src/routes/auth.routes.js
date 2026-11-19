const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Library = require('../models/Library');
const Student = require('../models/Student');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { sendOtp, verifyOtp } = require('../services/authOtp');
const { normalizePhone, phoneLookupVariants } = require('../utils/phone');
const {
  calculateMonthlyFee,
  getUpcomingFeeSchedule,
  syncStudentMonthlyFee,
} = require('../utils/feePricing');

const router = express.Router();

async function findUserByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (value.includes('@')) return User.findOne({ email: value.toLowerCase() });
  const variants = phoneLookupVariants(value);
  if (!variants.length) return null;
  return User.findOne({ phone: { $in: variants } });
}

async function createSessionPayload(user) {
  const library = user.libraryId ? await Library.findById(user.libraryId) : null;
  let studentProfile = null;
  if (user.studentProfileId) {
    studentProfile = await Student.findById(user.studentProfileId);
    if (studentProfile && library) {
      await syncStudentMonthlyFee(studentProfile, library);
      const upcomingSchedule = getUpcomingFeeSchedule(library);
      if (upcomingSchedule) {
        studentProfile = {
          ...studentProfile.toObject(),
          upcomingMonthlyFee: calculateMonthlyFee(
            library,
            studentProfile.slots?.length ? studentProfile.slots : [studentProfile.shift],
            upcomingSchedule.effectiveFrom
          ),
          upcomingFeeEffectiveFrom: upcomingSchedule.effectiveFrom,
        };
      }
    }
  }

  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      libraryId: user.libraryId,
      name: user.name,
      studentProfileId: user.studentProfileId,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentProfileId: user.studentProfileId,
    },
    library: library
      ? {
          id: library._id,
          name: library.name,
          slug: library.slug,
          city: library.city,
          totalSeats: library.totalSeats,
          defaultMonthlyFee: library.defaultMonthlyFee,
        }
      : null,
    studentProfile,
  };
}

/**
 * Send OTP for registration email verification
 */
router.post('/send-registration-otp', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This email is already registered. Please sign in.' });
    }
    const otpResult = await sendOtp({ email, purpose: 'verify_email' });
    return res.json({
      success: true,
      email,
      devCode: otpResult?.devCode,
      message: otpResult?.devCode
        ? `Verification OTP is: ${otpResult.devCode} (Dev mode)`
        : 'Verification code sent to your email.',
    });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Could not send verification code.' });
  }
});

/**
 * Verify OTP for registration
 */
router.post('/verify-registration-otp', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address and 6-digit code.' });
    }
    await verifyOtp({ email, purpose: 'verify_email', code });
    return res.json({
      success: true,
      verified: true,
      email,
      message: 'Email verified successfully!',
    });
  } catch (err) {
    return res.status(err.status || 400).json({ success: false, message: err.message || 'Invalid or expired code.' });
  }
});

/**
 * Register a new Library Tenant along with its first Admin
 */
router.post('/register-library', async (req, res) => {
  try {
    const {
      libraryName,
      city,
      address,
      phone,
      adminName,
      email,
      password,
      totalSeats = 50,
      monthlyFee = 800,
    } = req.body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);
    if (!libraryName || !adminName || !normalizedEmail || !password || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Library, admin name, valid email, mobile number, and password are required.',
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: { $in: phoneLookupVariants(normalizedPhone) } }],
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === normalizedEmail
          ? 'Email already registered.'
          : 'Mobile number already registered.',
      });
    }

    // Generate unique slug
    let slug = libraryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const slugExists = await Library.findOne({ slug });
    if (slugExists) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    // Create Tenant Library
    const library = await Library.create({
      name: libraryName,
      slug,
      city: city || 'Varanasi',
      address: address || '',
      phone: normalizedPhone,
      email: normalizedEmail,
      totalSeats: Number(totalSeats) || 50,
      defaultMonthlyFee: Number(monthlyFee) || 800,
    });

    const isPreVerified = Boolean(req.body?.isEmailVerified);

    // Create Library Admin User
    const admin = await User.create({
      libraryId: library._id,
      name: adminName,
      email: normalizedEmail,
      password,
      role: 'admin',
      phone: normalizedPhone,
      emailVerified: isPreVerified,
      emailVerifiedAt: isPreVerified ? new Date() : null,
    });

    if (isPreVerified) {
      const session = await createSessionPayload(admin);
      return res.status(201).json({
        ...session,
        message: 'Library account created successfully!',
      });
    }

    let otpResult;
    try {
      otpResult = await sendOtp({ user: admin, purpose: 'verify_email' });
    } catch (error) {
      return res.status(error.status || 503).json({
        success: false,
        verificationRequired: true,
        email: admin.email,
        message: `Account created, but the verification code could not be sent. ${error.message}`,
      });
    }

    return res.status(201).json({
      success: true,
      verificationRequired: true,
      email: admin.email,
      devCode: otpResult?.devCode,
      message: otpResult?.devCode
        ? `Account created. Verification OTP is: ${otpResult.devCode} (Dev mode)`
        : 'Account created. Enter the verification code sent to your email.',
      library: {
        id: library._id,
        name: library.name,
        slug: library.slug,
        city: library.city,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
  }
});

/**
 * Direct Student App Registration (Seat can be allocated later)
 */
router.post('/register-student', async (req, res) => {
  try {
    const { name, email, password, phone, libraryId } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);
    if (!name || !normalizedEmail || !password || !normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and phone are required' });
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: { $in: phoneLookupVariants(normalizedPhone) } }],
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === normalizedEmail
          ? 'Email already registered. Please sign in.'
          : 'Mobile number already registered.',
      });
    }

    // Default to first library if not selected
    let targetLibraryId = libraryId;
    if (!targetLibraryId) {
      const defaultLib = await Library.findOne();
      targetLibraryId = defaultLib ? defaultLib._id : null;
    }

    let studentProfile = null;
    if (targetLibraryId) {
      const lib = await Library.findById(targetLibraryId);
      studentProfile = await Student.create({
        libraryId: targetLibraryId,
        studentName: name,
        seatNumber: 'Pending Allocation',
        shift: 'Full Day (24x7)',
        slots: ['Full Day (24x7)'],
        contactNo: normalizedPhone,
        email: normalizedEmail,
        monthlyFee: lib?.defaultMonthlyFee || 800,
        status: 'Active',
      });
    }

    const isPreVerified = Boolean(req.body?.isEmailVerified);

    const user = await User.create({
      libraryId: targetLibraryId,
      studentProfileId: studentProfile ? studentProfile._id : null,
      name,
      email: normalizedEmail,
      password,
      role: 'student',
      phone: normalizedPhone,
      emailVerified: isPreVerified,
      emailVerifiedAt: isPreVerified ? new Date() : null,
    });

    if (isPreVerified) {
      const session = await createSessionPayload(user);
      return res.status(201).json({
        ...session,
        message: 'Student account created successfully!',
      });
    }

    let otpResult;
    try {
      otpResult = await sendOtp({ user, purpose: 'verify_email' });
    } catch (error) {
      return res.status(error.status || 503).json({
        success: false,
        verificationRequired: true,
        email: user.email,
        message: `Account created, but the verification code could not be sent. ${error.message}`,
      });
    }

    return res.status(201).json({
      success: true,
      verificationRequired: true,
      email: user.email,
      devCode: otpResult?.devCode,
      message: otpResult?.devCode
        ? `Account created. Verification OTP is: ${otpResult.devCode} (Dev mode)`
        : 'Account created. Enter the verification code sent to your email.',
    });
  } catch (err) {
    console.error('Student registration error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Login endpoint for Admin, Staff, Student
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const loginIdentifier = identifier || req.body.email;
    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Email or mobile number and password are required.' });
    }

    const user = await findUserByIdentifier(loginIdentifier);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        email: user.email,
        message: 'Verify your email address before signing in.',
      });
    }

    return res.json(await createSessionPayload(user));
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Enter the email address and 6-digit code.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    if (user.emailVerified !== false) {
      return res.status(400).json({ success: false, message: 'This email is already verified. Please sign in.' });
    }
    await verifyOtp({ email, purpose: 'verify_email', code });
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
    return res.json(await createSessionPayload(user));
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Could not verify email.' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const user = await findUserByIdentifier(req.body?.identifier || req.body?.email);
    if (!user || user.emailVerified !== false) {
      return res.json({ success: true, message: 'If this account needs verification, a code has been sent to its email.' });
    }
    const otpResult = await sendOtp({ user, purpose: 'verify_email' });
    return res.json({
      success: true,
      email: user.email,
      devCode: otpResult?.devCode,
      message: otpResult?.devCode
        ? `Verification OTP is: ${otpResult.devCode} (Dev mode)`
        : 'A new verification code has been sent.',
    });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Could not send verification code.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const genericResponse = {
    success: true,
    message: 'If an account matches that email or mobile number, a reset code has been sent to the registered email.',
  };
  try {
    const identifier = req.body?.identifier ?? req.body?.email ?? req.body?.phone;
    const user = await findUserByIdentifier(identifier);
    if (user) {
      const otpResult = await sendOtp({ user, purpose: 'reset_password' });
      if (otpResult?.devCode) genericResponse.devCode = otpResult.devCode;
      return res.json({
        ...genericResponse,
        email: user.email,
        phone: user.phone,
        deliveryMethod: 'email',
      });
    }
    return res.json(genericResponse);
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ success: false, message: err.message });
    console.error('Password reset email failed:', err.message);
    return res.status(503).json({ success: false, message: `Could not send reset code: ${err.message}` });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { identifier, email, phone, code, newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (!/^\d{6}$/.test(String(code || ''))) {
      return res.status(400).json({ success: false, message: 'Enter the 6-digit reset code.' });
    }
    const user = await findUserByIdentifier(identifier ?? email ?? phone);
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset code.' });

    await verifyOtp({ email: user.email, purpose: 'reset_password', code });
    user.password = newPassword;
    user.emailVerified = true;
    user.emailVerifiedAt = user.emailVerifiedAt || new Date();
    await user.save();
    return res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Could not reset password.' });
  }
});

/**
 * Get current authenticated user profile
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const library = user.libraryId ? await Library.findById(user.libraryId) : null;
    let studentProfile = null;
    if (user.studentProfileId) {
      studentProfile = await Student.findById(user.studentProfileId);
      if (studentProfile && library) {
        await syncStudentMonthlyFee(studentProfile, library);
        const upcomingSchedule = getUpcomingFeeSchedule(library);
        if (upcomingSchedule) {
          studentProfile = {
            ...studentProfile.toObject(),
            upcomingMonthlyFee: calculateMonthlyFee(
              library,
              studentProfile.slots?.length ? studentProfile.slots : [studentProfile.shift],
              upcomingSchedule.effectiveFrom
            ),
            upcomingFeeEffectiveFrom: upcomingSchedule.effectiveFrom,
          };
        }
      }
    }

    return res.json({
      success: true,
      user,
      library,
      studentProfile,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router;
