const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'petcare_passport_super_secure_jwt_secret_key_2026_xyz';

async function authenticate(req, res, next) {
  try {
    let token = null;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please sign in.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session. Please sign in again.' });
    }

    // Look up user from database to ensure up-to-date status and role
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User account not found.' });
    }

    // Backend enforcement of suspended accounts
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        suspended: true,
        message: `Account is suspended. Reason: ${user.suspensionReason || 'Violation of platform terms.'}`,
      });
    }

    // Backend enforcement of unverified accounts (except admins)
    if (!user.isEmailVerified && user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email address to access your pet passports.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error);
    return res.status(500).json({ success: false, message: 'Authentication service error.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrative privileges are strictly required.',
    });
  }
  next();
}

module.exports = {
  authenticate,
  requireAdmin,
  JWT_SECRET,
};
