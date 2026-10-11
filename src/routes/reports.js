const express = require('express');
const router = express.Router();
const FoundReport = require('../models/FoundReport');
const Pet = require('../models/Pet');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/reports - Get all sighting reports for pets owned by the authenticated owner
router.get('/', async (req, res) => {
  try {
    const ownerPets = await Pet.find({ owner: req.user._id }).select('_id name species photoUrl status');
    const petMap = {};
    ownerPets.forEach((p) => {
      petMap[p._id.toString()] = p;
    });

    const petIds = ownerPets.map((p) => p._id);

    const reports = await FoundReport.find({ pet: { $in: petIds } })
      .populate('pet', 'name species photoUrl status publicCode')
      .sort({ createdAt: -1 });

    return res.json({ success: true, reports });
  } catch (error) {
    console.error('[Owner Reports Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve reports.' });
  }
});

// GET /api/reports/:id - Get details for a specific report ensuring ownership
router.get('/:id', async (req, res) => {
  try {
    const report = await FoundReport.findById(req.params.id).populate('pet', 'name species photoUrl owner status');
    if (!report || !report.pet || report.pet.owner.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Report not found or unauthorized.' });
    }

    return res.json({ success: true, report });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve report.' });
  }
});

// PATCH /api/reports/:id/review - Mark report as reviewed
router.patch('/:id/review', async (req, res) => {
  try {
    const report = await FoundReport.findById(req.params.id).populate('pet', 'owner');
    if (!report || !report.pet || report.pet.owner.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Report not found or unauthorized.' });
    }

    report.status = 'REVIEWED';
    report.reviewedAt = new Date();
    await report.save();

    return res.json({ success: true, message: 'Report marked as reviewed.', report });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update report.' });
  }
});

// PATCH /api/reports/:id/flag - Flag suspicious report for administrative moderation
router.patch('/:id/flag', async (req, res) => {
  try {
    const { reason } = req.body;
    const report = await FoundReport.findById(req.params.id).populate('pet', 'owner');
    if (!report || !report.pet || report.pet.owner.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Report not found or unauthorized.' });
    }

    report.status = 'FLAGGED';
    report.flagReason = reason || 'Owner reported suspicious or abusive content';
    await report.save();

    return res.json({ success: true, message: 'Report flagged for administrator moderation.', report });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to flag report.' });
  }
});

module.exports = router;
