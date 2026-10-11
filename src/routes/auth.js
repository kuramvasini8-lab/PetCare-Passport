const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { seedSampleData } = require('../services/seedService');
const { sendOtpEmail } = require('../services/emailService');

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    const otpLastSentAt = new Date();

    if (existingUser) {
      if (existingUser.isEmailVerified) {
        return res.status(409).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
      }

      // If user exists but is unverified, update credentials and send a fresh OTP
      await User.findByIdAndUpdate(existingUser.id, {
        name: name.trim(),
        password,
        phone: phone ? phone.trim() : '',
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        otpLastSentAt,
      });

      await sendOtpEmail(normalizedEmail, name.trim(), otp, otpExpiresAt);

      return res.status(200).json({
        success: true,
        requiresVerification: true,
        email: normalizedEmail,
        message: 'Account is pending verification. A fresh 6-digit code has been sent to your email.',
      });
    }

    // Role is always OWNER upon normal registration (never allow client to supply role)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: phone ? phone.trim() : '',
      role: 'OWNER',
      status: 'ACTIVE',
      verificationStatus: 'UNVERIFIED',
      isEmailVerified: false,
      otpHash,
      otpExpiresAt,
      otpAttempts: 0,
      otpLastSentAt,
    });

    // Send OTP verification email
    await sendOtpEmail(normalizedEmail, user.name, otp, otpExpiresAt);

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      email: user.email,
      message: 'Registration successful! Please enter the 6-digit verification code sent to your email.',
    });
  } catch (error) {
    console.error('[Register Error]:', error);
    return res.status(500).json({ success: false, message: 'Registration failed due to a server error.' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and 6-digit verification code are required.' });
    }

    const cleanOtp = String(otp).trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({ success: false, message: 'Verification code must be exactly 6 digits.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found with this email address.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Your email is already verified. You can sign in now.' });
    }

    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'No active verification code found. Please click "Resend Code" to receive a new one.',
      });
    }

    // Check maximum verification attempts (max 5)
    const currentAttempts = user.otpAttempts || 0;
    if (currentAttempts >= 5) {
      return res.status(429).json({
        success: false,
        maxAttemptsExceeded: true,
        message: 'Too many failed verification attempts. For your security, please request a new verification code.',
      });
    }

    // Check expiration (5 minutes)
    const now = Date.now();
    const expiresAt = new Date(user.otpExpiresAt).getTime();
    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        expired: true,
        message: 'Your verification code has expired. Please click "Resend Code" to get a new code.',
      });
    }

    // Validate OTP against bcrypt hash
    const isMatch = await bcrypt.compare(cleanOtp, user.otpHash);
    if (!isMatch) {
      const newAttempts = currentAttempts + 1;
      await User.findByIdAndUpdate(user.id, { otpAttempts: newAttempts });
      const remaining = Math.max(0, 5 - newAttempts);

      if (remaining === 0) {
        return res.status(429).json({
          success: false,
          maxAttemptsExceeded: true,
          message: 'Incorrect code. Maximum attempts reached. Please request a new verification code.',
        });
      }

      return res.status(400).json({
        success: false,
        remainingAttempts: remaining,
        message: `Incorrect verification code. You have ${remaining} attempt(s) remaining.`,
      });
    }

    // OTP Verified! Mark account as email verified
    await User.findByIdAndUpdate(user.id, {
      isEmailVerified: true,
      verificationStatus: 'VERIFIED',
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpLastSentAt: null,
    });

    const verifiedUser = await User.findById(user.id);
    const token = generateToken(verifiedUser);

    return res.json({
      success: true,
      message: 'Email verified successfully! Welcome to PetCare Passport.',
      token,
      user: {
        id: verifiedUser._id,
        name: verifiedUser.name,
        email: verifiedUser.email,
        role: verifiedUser.role,
        status: verifiedUser.status,
        verificationStatus: verifiedUser.verificationStatus,
        isEmailVerified: true,
      },
    });
  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({ success: false, message: 'OTP verification failed due to a server error.' });
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email address.' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Your email is already verified. You can sign in now.' });
    }

    // Cooldown check (60 seconds)
    const COOLDOWN_SECONDS = 60;
    if (user.otpLastSentAt) {
      const elapsedMs = Date.now() - new Date(user.otpLastSentAt).getTime();
      const cooldownMs = COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          cooldownActive: true,
          retryAfterSeconds: remainingSeconds,
          message: `Please wait ${remainingSeconds} second(s) before requesting a new code.`,
        });
      }
    }

    // Generate fresh OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const otpLastSentAt = new Date();

    await User.findByIdAndUpdate(user.id, {
      otpHash,
      otpExpiresAt,
      otpAttempts: 0,
      otpLastSentAt,
    });

    await sendOtpEmail(normalizedEmail, user.name, otp, otpExpiresAt);

    return res.json({
      success: true,
      message: 'A fresh 6-digit verification code has been sent to your email.',
      cooldownSeconds: COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error('[Resend OTP Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to resend code due to a server error.' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email address or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email address or password.' });
    }

    // Backend enforcement of suspended accounts
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        suspended: true,
        message: `Your account is suspended. Reason: ${user.suspensionReason || 'Violation of community safety guidelines.'}`,
      });
    }

    // Backend enforcement of unverified accounts (except admins)
    if (!user.isEmailVerified && user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Your email address has not been verified yet. Please enter the verification code sent to your email.',
      });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Sign in successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        verificationStatus: user.verificationStatus,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error('[Login Error]:', error);
    return res.status(500).json({ success: false, message: 'Sign in failed due to a server error.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  return res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      role: req.user.role,
      status: req.user.status,
      verificationStatus: req.user.verificationStatus,
      isEmailVerified: req.user.isEmailVerified,
      createdAt: req.user.createdAt,
    },
  });
});

// POST /api/auth/update-profile
router.post('/update-profile', authenticate, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (name) req.user.name = name.trim();
    if (phone !== undefined) req.user.phone = phone.trim();
    await req.user.save();

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/seed-demo
router.post('/seed-demo', authenticate, async (req, res) => {
  try {
    const result = await seedSampleData(req.user);
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
