const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Pet = require('../models/Pet');
const HealthRecord = require('../models/HealthRecord');
const FoundReport = require('../models/FoundReport');
const AuditLog = require('../models/AuditLog');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Strict backend enforcement: Every route in this module requires active ADMIN authentication
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/stats - Platform Overview with real DB counts
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'ACTIVE' });
    const suspendedUsers = await User.countDocuments({ status: 'SUSPENDED' });

    const totalPets = await Pet.countDocuments();
    const activeLostCases = await Pet.countDocuments({ status: 'LOST' });
    const recoveredPets = 0;

    const totalHealthRecords = await HealthRecord.countDocuments();
    const totalVaccinations = await HealthRecord.countDocuments({ category: 'VACCINATION' });

    const totalReports = await FoundReport.countDocuments();
    const pendingReports = await FoundReport.countDocuments({ status: 'PENDING' });
    const flaggedReports = await FoundReport.countDocuments({ status: 'FLAGGED' });

    const recentUsers = await User.find().select('name email role status verificationStatus createdAt').sort({ createdAt: -1 }).limit(6);
    const recentReports = await FoundReport.find().populate('pet', 'name species publicCode').sort({ createdAt: -1 }).limit(6);
    const recentAuditLogs = await AuditLog.find().sort({ createdAt: -1 }).limit(8);

    return res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalPets,
        activeLostCases,
        recoveredPets,
        totalHealthRecords,
        totalVaccinations,
        totalReports,
        pendingReports,
        flaggedReports,
      },
      recentUsers,
      recentReports,
      recentAuditLogs,
    });
  } catch (error) {
    console.error('[Admin Stats Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve administrative statistics.' });
  }
});

// GET /api/admin/users - User management list with search & filter
router.get('/users', async (req, res) => {
  try {
    const { search, status, role } = req.query;
    const query = {};

    if (status && status !== 'ALL') query.status = status;
    if (role && role !== 'ALL') query.role = role;

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [{ name: { $regex: term, $options: 'i' } }, { email: { $regex: term, $options: 'i' } }];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 });

    return res.json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
});

// POST /api/admin/users/:id/suspend - Suspend account with reason
router.post('/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Protection: Prevent admin from suspending themselves
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot suspend your own administrative account.' });
    }

    targetUser.status = 'SUSPENDED';
    targetUser.suspensionReason = reason || 'Administrative sanction for platform violation.';
    targetUser.suspendedAt = new Date();
    targetUser.suspendedBy = req.user._id;
    await targetUser.save();

    await AuditLog.create({
      admin: req.user._id,
      adminEmail: req.user.email,
      action: 'SUSPEND_USER',
      targetType: 'User',
      targetId: targetUser._id.toString(),
      reason: reason || 'Suspension applied',
      details: { targetEmail: targetUser.email, targetName: targetUser.name },
    });

    return res.json({
      success: true,
      message: `Account for ${targetUser.email} has been suspended.`,
      user: targetUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to suspend user.' });
  }
});

// POST /api/admin/users/:id/reactivate - Reactivate suspended account
router.post('/users/:id/reactivate', async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    targetUser.status = 'ACTIVE';
    targetUser.suspensionReason = '';
    targetUser.suspendedAt = undefined;
    targetUser.suspendedBy = undefined;
    await targetUser.save();

    await AuditLog.create({
      admin: req.user._id,
      adminEmail: req.user.email,
      action: 'REACTIVATE_USER',
      targetType: 'User',
      targetId: targetUser._id.toString(),
      reason: 'Administrative account reinstatement',
      details: { targetEmail: targetUser.email },
    });

    return res.json({
      success: true,
      message: `Account for ${targetUser.email} has been reactivated.`,
      user: targetUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reactivate user.' });
  }
});

// POST /api/admin/users/:id/verify - Update account verification status
router.post('/users/:id/verify', async (req, res) => {
  try {
    const { verificationStatus, notes } = req.body;
    if (!['UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED'].includes(verificationStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid verification status.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    targetUser.verificationStatus = verificationStatus;
    targetUser.verificationNotes = notes || '';
    await targetUser.save();

    await AuditLog.create({
      admin: req.user._id,
      adminEmail: req.user.email,
      action: 'VERIFY_USER',
      targetType: 'User',
      targetId: targetUser._id.toString(),
      reason: `Verification updated to ${verificationStatus}`,
      details: { notes },
    });

    return res.json({
      success: true,
      message: `Verification status updated to ${verificationStatus}.`,
      user: targetUser,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update verification status.' });
  }
});

// GET /api/admin/reports - Sighting reports moderation list
router.get('/reports', async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'ALL') query.status = status;

    const reports = await FoundReport.find(query)
      .populate('pet', 'name species publicCode status')
      .populate('moderatedBy', 'name email')
      .sort({ createdAt: -1 });

    return res.json({ success: true, reports });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve reports.' });
  }
});

// POST /api/admin/reports/:id/moderate - Moderate a report (dismiss, review, flag, or remove)
router.post('/reports/:id/moderate', async (req, res) => {
  try {
    const { status, moderationNotes } = req.body;
    if (!['REVIEWED', 'FLAGGED', 'DISMISSED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid moderation status.' });
    }

    const report = await FoundReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    report.status = status;
    report.moderationNotes = moderationNotes || '';
    report.moderatedBy = req.user._id;
    await report.save();

    await AuditLog.create({
      admin: req.user._id,
      adminEmail: req.user.email,
      action: status === 'DISMISSED' ? 'DISMISS_REPORT' : 'MODERATE_REPORT',
      targetType: 'FoundReport',
      targetId: report._id.toString(),
      reason: moderationNotes || `Moderated to ${status}`,
    });

    return res.json({
      success: true,
      message: `Report status updated to ${status}.`,
      report,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to moderate report.' });
  }
});

// GET /api/admin/pets - Pet oversight list
router.get('/pets', async (req, res) => {
  try {
    const { search, status, species } = req.query;
    const query = {};

    if (status && status !== 'ALL') query.status = status;
    if (species && species !== 'ALL') query.species = species;

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [{ name: { $regex: term, $options: 'i' } }, { publicCode: { $regex: term, $options: 'i' } }];
    }

    const pets = await Pet.find(query)
      .populate('owner', 'name email status')
      .sort({ createdAt: -1 });

    return res.json({ success: true, pets });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve pet oversight list.' });
  }
});

// POST /api/admin/pets/:id/flag - Flag or unflag pet profile for investigation
router.post('/pets/:id/flag', async (req, res) => {
  try {
    const { flag, reason } = req.body;
    const pet = await Pet.findById(req.params.id);
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found.' });
    }

    pet.flaggedForModeration = Boolean(flag);
    pet.flagReason = flag ? reason || 'Flagged for moderation review' : '';
    await pet.save();

    await AuditLog.create({
      admin: req.user._id,
      adminEmail: req.user.email,
      action: flag ? 'FLAG_PET' : 'UNFLAG_PET',
      targetType: 'Pet',
      targetId: pet._id.toString(),
      reason: reason || (flag ? 'Profile flagged' : 'Profile cleared'),
    });

    return res.json({
      success: true,
      message: flag ? 'Pet profile flagged for review.' : 'Pet profile cleared.',
      pet,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update pet flag.' });
  }
});

// GET /api/admin/audit-logs - Administrative audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve audit logs.' });
  }
});

// GET /api/admin/analytics - Platform analytics breakdown
router.get('/analytics', async (req, res) => {
  try {
    const speciesBreakdown = await Pet.aggregate([
      { $group: { _id: '$species', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const statusBreakdown = await Pet.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const recordsBreakdown = await HealthRecord.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return res.json({
      success: true,
      analytics: {
        speciesBreakdown,
        statusBreakdown,
        recordsBreakdown,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to compile platform analytics.' });
  }
});

module.exports = router;
