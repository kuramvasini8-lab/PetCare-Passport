const express = require('express');
const router = express.Router();
const HealthRecord = require('../models/HealthRecord');
const Pet = require('../models/Pet');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/health - List health records with filtering
router.get('/', async (req, res) => {
  try {
    const { petId, category, status } = req.query;
    const query = { owner: req.user._id };

    if (petId) {
      query.pet = petId;
    }

    if (category && category !== 'ALL') {
      query.category = category;
    }

    const records = await HealthRecord.find(query)
      .populate('pet', 'name species photoUrl')
      .sort({ date: -1, dueDate: 1 });

    // Ensure up-to-date computed vaccination statuses
    const processed = records.map((rec) => {
      const obj = rec.toObject();
      if (rec.category === 'VACCINATION') {
        obj.computedStatus = rec.calculateVaccinationStatus();
      } else {
        obj.computedStatus = rec.status;
      }
      return obj;
    });

    // Optional status filter
    let finalRecords = processed;
    if (status && status !== 'ALL') {
      finalRecords = processed.filter((r) => r.computedStatus === status || r.status === status);
    }

    return res.json({ success: true, records: finalRecords });
  } catch (error) {
    console.error('[Get Health Records Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve health records.' });
  }
});

// POST /api/health - Create new health record
router.post('/', async (req, res) => {
  try {
    const {
      petId,
      category,
      title,
      date,
      dueDate,
      vetClinic,
      dosageInstructions,
      reaction,
      weightValue,
      notes,
      isCompleted,
    } = req.body;

    if (!petId || !category || !title) {
      return res.status(400).json({ success: false, message: 'Pet, category, and title are required.' });
    }

    // Verify pet ownership
    const pet = await Pet.findOne({ _id: petId, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const completed = isCompleted === true || isCompleted === 'true';

    const record = new HealthRecord({
      pet: pet._id,
      owner: req.user._id,
      category,
      title: title.trim(),
      date: date ? new Date(date) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      vetClinic: vetClinic ? vetClinic.trim() : '',
      dosageInstructions: dosageInstructions ? dosageInstructions.trim() : '',
      reaction: reaction ? reaction.trim() : '',
      weightValue: weightValue ? parseFloat(weightValue) : undefined,
      notes: notes ? notes.trim() : '',
      isCompleted: completed,
      verifiedByVet: false, // Distinguish owner-entered from vet-verified
    });

    // Sync weight to pet profile if category is WEIGHT
    if (category === 'WEIGHT' && weightValue) {
      pet.weight = parseFloat(weightValue);
      await pet.save();
    }

    // Calculate status
    record.status = record.calculateVaccinationStatus();
    await record.save();

    await Notification.create({
      user: req.user._id,
      title: 'Health Record Added',
      message: `Added ${category.toLowerCase().replace('_', ' ')} record "${title}" for ${pet.name}.`,
      type: 'success',
      link: '#health',
    });

    return res.status(201).json({
      success: true,
      message: 'Health record saved successfully.',
      record,
    });
  } catch (error) {
    console.error('[Create Health Record Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to save health record.' });
  }
});

// PUT /api/health/:id - Update record
router.put('/:id', async (req, res) => {
  try {
    const record = await HealthRecord.findOne({ _id: req.params.id, owner: req.user._id });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found or unauthorized.' });
    }

    const fields = ['title', 'vetClinic', 'dosageInstructions', 'reaction', 'notes'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) record[f] = req.body[f];
    });

    if (req.body.date) record.date = new Date(req.body.date);
    if (req.body.dueDate !== undefined) {
      record.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : undefined;
    }

    if (req.body.weightValue !== undefined && req.body.weightValue !== '') {
      record.weightValue = parseFloat(req.body.weightValue);
    }

    if (req.body.isCompleted !== undefined) {
      record.isCompleted = req.body.isCompleted === true || req.body.isCompleted === 'true';
    }

    record.status = record.calculateVaccinationStatus();
    await record.save();

    return res.json({
      success: true,
      message: 'Health record updated successfully.',
      record,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update record.' });
  }
});

// PATCH /api/health/:id/complete - Mark vaccination as completed
router.patch('/:id/complete', async (req, res) => {
  try {
    const record = await HealthRecord.findOne({ _id: req.params.id, owner: req.user._id });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found or unauthorized.' });
    }

    record.isCompleted = true;
    record.status = 'COMPLETED';
    record.date = new Date(); // record administered today
    await record.save();

    return res.json({
      success: true,
      message: 'Vaccination marked as completed!',
      record,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update vaccination.' });
  }
});

// DELETE /api/health/:id - Delete record
router.delete('/:id', async (req, res) => {
  try {
    const record = await HealthRecord.findOne({ _id: req.params.id, owner: req.user._id });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found or unauthorized.' });
    }

    await HealthRecord.deleteOne({ _id: req.params.id });

    return res.json({
      success: true,
      message: 'Health record removed successfully.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete record.' });
  }
});

module.exports = router;
