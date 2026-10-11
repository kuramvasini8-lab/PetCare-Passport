const rateLimit = require('express-rate-limit');

// Limiter for public found-pet sighting submissions
const publicReportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many sighting reports submitted from this network. Please wait a few minutes before trying again.',
  },
});

// Limiter for AI endpoints to prevent quota exhaustion
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'AI request limit reached. Please pause for a moment before asking another question.',
  },
});

// Limiter for auth login & register
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
});

module.exports = {
  publicReportLimiter,
  aiLimiter,
  authLimiter,
};
