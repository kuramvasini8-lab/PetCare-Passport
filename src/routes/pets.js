const express = require('express');
const router = express.Router();
const Pet = require('../models/Pet');
const HealthRecord = require('../models/HealthRecord');
const FoundReport = require('../models/FoundReport');
const Notification = require('../models/Notification');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All pet routes require authentication
router.use(authenticate);

// GET /api/pets - Get all pets belonging to authenticated owner with search & filter
router.get('/', async (req, res) => {
  try {
    const { search, species, status } = req.query;
    const query = { owner: req.user._id };

    if (species && species !== 'All') {
      query.species = species;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { name: { $regex: term, $options: 'i' } },
        { breed: { $regex: term, $options: 'i' } },
        { microchip: { $regex: term, $options: 'i' } },
      ];
    }

    const pets = await Pet.find(query).sort({ createdAt: -1 });
    return res.json({ success: true, pets });
  } catch (error) {
    console.error('[Get Pets Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve pets.' });
  }
});

// GET /api/pets/dashboard-stats - Calculated purely from genuine DB records
router.get('/dashboard-stats', async (req, res) => {
  try {
    const ownerId = req.user._id;

    // 1. Total registered pets
    const totalPets = await Pet.countDocuments({ owner: ownerId });

    // 2. Active lost cases
    const lostPetsCount = await Pet.countDocuments({ owner: ownerId, status: 'LOST' });

    // 3. Health records & Vaccinations
    const records = await HealthRecord.find({ owner: ownerId }).populate('pet', 'name species');

    let upcomingVaccinations = 0;
    let overdueVaccinations = 0;
    let totalVetVisits = 0;

    const now = new Date();

    for (const rec of records) {
      if (rec.category === 'VET_VISIT') {
        totalVetVisits++;
      } else if (rec.category === 'VACCINATION') {
        const status = rec.calculateVaccinationStatus();
        if (status === 'UPCOMING') upcomingVaccinations++;
        if (status === 'OVERDUE') overdueVaccinations++;
      }
    }

    // 4. Pending found-pet sighting reports for owner's pets
    const ownerPets = await Pet.find({ owner: ownerId }).select('_id');
    const petIds = ownerPets.map((p) => p._id);
    const pendingReportsCount = await FoundReport.countDocuments({ pet: { $in: petIds }, status: 'PENDING' });

    // 5. Recent health activity (last 5 records)
    const recentActivity = await HealthRecord.find({ owner: ownerId })
      .populate('pet', 'name species photoUrl')
      .sort({ createdAt: -1 })
      .limit(5);

    // 6. Notifications count
    const unreadNotifications = await Notification.countDocuments({ user: ownerId, isRead: false });

    return res.json({
      success: true,
      stats: {
        totalPets,
        lostPetsCount,
        upcomingVaccinations,
        overdueVaccinations,
        totalVetVisits,
        pendingReportsCount,
        unreadNotifications,
        recentActivity,
      },
    });
  } catch (error) {
    console.error('[Dashboard Stats Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute dashboard stats.' });
  }
});

// GET /api/pets/:id - Get single pet profile with health records
router.get('/:id', async (req, res) => {
  try {
    const pet = await Pet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const healthRecords = await HealthRecord.find({ pet: pet._id }).sort({ date: -1 });
    const sightingReports = await FoundReport.find({ pet: pet._id }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      pet,
      healthRecords,
      sightingReports,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve pet profile.' });
  }
});

// POST /api/pets - Create a new pet
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const {
      name,
      species,
      breed,
      dob,
      gender,
      weight,
      bloodGroup,
      microchip,
      neutered,
      allergies,
      conditions,
      specialCare,
      emergencyPhone,
      emergencyEmail,
    } = req.body;

    if (!name || !species) {
      return res.status(400).json({ success: false, message: 'Pet name and species are required.' });
    }

    let photoUrl = req.body.photoUrl || '';
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const pet = await Pet.create({
      owner: req.user._id,
      name: name.trim(),
      species,
      breed: breed ? breed.trim() : '',
      dob: dob ? new Date(dob) : undefined,
      gender: gender || 'Unknown',
      weight: weight ? parseFloat(weight) : undefined,
      bloodGroup: bloodGroup ? bloodGroup.trim() : '',
      photoUrl,
      microchip: microchip ? microchip.trim() : '',
      neutered: neutered === 'true' || neutered === true,
      allergies: allergies ? allergies.trim() : '',
      conditions: conditions ? conditions.trim() : '',
      specialCare: specialCare ? specialCare.trim() : '',
      emergencyPhone: emergencyPhone ? emergencyPhone.trim() : req.user.phone || '',
      emergencyEmail: emergencyEmail ? emergencyEmail.trim() : req.user.email || '',
    });

    await Notification.create({
      user: req.user._id,
      title: 'Pet Registered',
      message: `${pet.name} has been successfully added to your PetCare Passport.`,
      type: 'success',
      link: `#pets`,
    });

    return res.status(201).json({
      success: true,
      message: `${pet.name} registered successfully!`,
      pet,
    });
  } catch (error) {
    console.error('[Create Pet Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to create pet profile.' });
  }
});

// PUT /api/pets/:id - Update pet profile
router.put('/:id', upload.single('photo'), async (req, res) => {
  try {
    const pet = await Pet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const fields = [
      'name',
      'species',
      'breed',
      'gender',
      'bloodGroup',
      'microchip',
      'allergies',
      'conditions',
      'specialCare',
      'emergencyPhone',
      'emergencyEmail',
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        pet[f] = req.body[f];
      }
    });

    if (req.body.dob) {
      pet.dob = new Date(req.body.dob);
    }

    if (req.body.weight !== undefined && req.body.weight !== '') {
      pet.weight = parseFloat(req.body.weight);
    }

    if (req.body.neutered !== undefined) {
      pet.neutered = req.body.neutered === 'true' || req.body.neutered === true;
    }

    if (req.file) {
      pet.photoUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.photoUrl) {
      pet.photoUrl = req.body.photoUrl;
    }

    await pet.save();

    return res.json({
      success: true,
      message: 'Pet profile updated successfully.',
      pet,
    });
  } catch (error) {
    console.error('[Update Pet Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to update pet.' });
  }
});

// PUT /api/pets/:id/privacy - Configure public emergency privacy settings
router.put('/:id/privacy', async (req, res) => {
  try {
    const pet = await Pet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const {
      showPhoto,
      showNameBreed,
      showMedical,
      showAllergies,
      showSpecialCare,
      showPhone,
      showEmail,
    } = req.body;

    pet.privacySettings = {
      showPhoto: Boolean(showPhoto),
      showNameBreed: Boolean(showNameBreed),
      showMedical: Boolean(showMedical),
      showAllergies: Boolean(showAllergies),
      showSpecialCare: Boolean(showSpecialCare),
      showPhone: Boolean(showPhone),
      showEmail: Boolean(showEmail),
    };

    await pet.save();

    return res.json({
      success: true,
      message: 'Emergency privacy preferences saved.',
      privacySettings: pet.privacySettings,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update privacy settings.' });
  }
});

// POST /api/pets/:id/status - Update companion status (LOST / SAFE)
router.post('/:id/status', async (req, res) => {
  try {
    const pet = await Pet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const { status, lastSeenLocation, lastSeenDate, circumstances } = req.body;
    const newStatus = status === 'LOST' ? 'LOST' : 'SAFE';
    pet.status = newStatus;

    if (newStatus === 'LOST') {
      pet.lostDetails = {
        lastSeenLocation: lastSeenLocation || '',
        lastSeenDate: lastSeenDate ? new Date(lastSeenDate) : new Date(),
        circumstances: circumstances || '',
      };
      await Notification.create({
        user: req.user._id,
        pet: pet._id,
        title: `🚨 Lost Alert Activated: ${pet.name}`,
        message: `Lost mode active. Community finder sighting reports will notify you instantly.`,
        type: 'alert',
        link: '#lost-center',
      });
    } else {
      pet.lostDetails = null;
      await Notification.create({
        user: req.user._id,
        pet: pet._id,
        title: `✅ Companion Safe: ${pet.name}`,
        message: `${pet.name} is marked as recovered and safe!`,
        type: 'info',
        link: '#pets',
      });
    }

    await pet.save();

    return res.json({
      success: true,
      message: newStatus === 'LOST' ? `Lost alert activated for ${pet.name}.` : `${pet.name} is marked as Safe!`,
      pet,
    });
  } catch (error) {
    console.error('[Pet Status Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to update pet status.' });
  }
});

// DELETE /api/pets/:id - Delete pet and cascade delete associated records
router.delete('/:id', async (req, res) => {
  try {
    const pet = await Pet.findOne({ _id: req.params.id, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const petName = pet.name;
    const petId = pet._id;

    // Cascade delete associated health records & sighting reports
    await HealthRecord.deleteMany({ pet: petId });
    await FoundReport.deleteMany({ pet: petId });
    await Pet.deleteOne({ _id: petId });

    await Notification.create({
      user: req.user._id,
      title: 'Pet Profile Removed',
      message: `${petName}'s profile and associated records were permanently removed.`,
      type: 'info',
    });

    return res.json({
      success: true,
      message: `${petName} and all associated records have been removed.`,
    });
  } catch (error) {
    console.error('[Delete Pet Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete pet.' });
  }
});

module.exports = router;
