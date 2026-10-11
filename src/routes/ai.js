const express = require('express');
const router = express.Router();
const Pet = require('../models/Pet');
const FoundReport = require('../models/FoundReport');
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const {
  chatAssistant,
  explainVeterinaryNote,
  generatePetCareGuide,
  summarizeFoundReport,
} = require('../services/aiService');

router.use(authenticate);
router.use(aiLimiter);

// POST /api/ai/chat - Pet Care Assistant
router.post('/chat', async (req, res) => {
  try {
    const { prompt, conversationHistory, petId } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please enter a question or message.' });
    }

    let petContext = null;
    if (petId) {
      const pet = await Pet.findOne({ _id: petId, owner: req.user._id });
      if (pet) {
        petContext = {
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          dob: pet.dob,
          weight: pet.weight,
          allergies: pet.allergies,
          conditions: pet.conditions,
        };
      }
    }

    const response = await chatAssistant(prompt.trim(), conversationHistory || [], petContext);
    return res.json(response);
  } catch (error) {
    console.error('[AI Chat Route Error]:', error);
    return res.status(500).json({ success: false, message: 'AI chat service encountered an error.' });
  }
});

// POST /api/ai/explain-note - Veterinary Note Explainer
router.post('/explain-note', async (req, res) => {
  try {
    const { noteText, petId } = req.body;

    if (!noteText || noteText.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide veterinary clinical text to explain.' });
    }

    let petContext = null;
    if (petId) {
      const pet = await Pet.findOne({ _id: petId, owner: req.user._id });
      if (pet) {
        petContext = {
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
        };
      }
    }

    const response = await explainVeterinaryNote(noteText.trim(), petContext);
    return res.json(response);
  } catch (error) {
    console.error('[AI Explain Note Route Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate note explanation.' });
  }
});

// POST /api/ai/care-guide - Personalized Pet Care Guide
router.post('/care-guide', async (req, res) => {
  try {
    const { petId } = req.body;

    if (!petId) {
      return res.status(400).json({ success: false, message: 'Please specify a pet to generate a care guide for.' });
    }

    const pet = await Pet.findOne({ _id: petId, owner: req.user._id });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }

    const petData = {
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      weight: pet.weight,
      conditions: pet.conditions,
      allergies: pet.allergies,
      specialCare: pet.specialCare,
    };

    const response = await generatePetCareGuide(petData);
    return res.json(response);
  } catch (error) {
    console.error('[AI Care Guide Route Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate pet care guide.' });
  }
});

// POST /api/ai/summarize-report - Found-Pet Sighting Summarizer
router.post('/summarize-report', async (req, res) => {
  try {
    const { reportId } = req.body;

    if (!reportId) {
      return res.status(400).json({ success: false, message: 'Report ID required.' });
    }

    const report = await FoundReport.findById(reportId).populate('pet');
    if (!report || !report.pet || report.pet.owner.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Report not found or unauthorized.' });
    }

    const response = await summarizeFoundReport(report, report.pet);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to summarize report.' });
  }
});

module.exports = router;
