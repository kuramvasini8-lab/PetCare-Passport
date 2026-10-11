const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const jpeg = require('jpeg-js');
const Pet = require('../models/Pet');
const FoundReport = require('../models/FoundReport');
const Notification = require('../models/Notification');
const { publicReportLimiter } = require('../middleware/rateLimiter');

/**
 * Robust Base URL resolution supporting:
 * 1. Environment variable APP_URL or PUBLIC_URL (e.g. for deployed domains or LAN test URLs)
 * 2. Client-provided origin header or query param ?origin= (from the active browser window)
 * 3. Reverse proxy / forwarded headers (x-forwarded-proto, x-forwarded-host)
 * 4. Direct Express request fallback
 */
function resolveBaseUrl(req) {
  // 1. Explicit environment configuration
  const envUrl = process.env.APP_URL || process.env.PUBLIC_URL;
  if (envUrl && envUrl.trim() && !envUrl.includes('localhost')) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. Client query parameter ?origin= (if valid URL provided by frontend)
  if (req.query && req.query.origin) {
    try {
      const parsed = new URL(req.query.origin);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return parsed.origin;
      }
    } catch (_) {}
  }

  // 3. Client Origin or Referer header
  if (req.headers.origin) {
    try {
      const parsed = new URL(req.headers.origin);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return parsed.origin;
      }
    } catch (_) {}
  }

  // 4. Reverse proxy / forwarded headers
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/**
 * Generate a genuine binary JPEG buffer for a QR code
 */
function generateQrJpegBuffer(destinationUrl) {
  const qr = QRCode.create(destinationUrl, { errorCorrectionLevel: 'H' });
  const moduleCount = qr.modules.size;
  const scale = 14; // 14px per module gives high-definition 600-800px print-ready resolution
  const margin = 4 * scale; // 4-module quiet zone (ISO/IEC 18004 standard)
  const width = (moduleCount * scale) + (margin * 2);
  const height = width;
  const frameData = Buffer.alloc(width * height * 4);

  // Initialize pure white background (#FFFFFF)
  frameData.fill(255);

  // Render high-contrast dark modules (#000000)
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qr.modules.get(c, r)) {
        const startX = margin + (c * scale);
        const startY = margin + (r * scale);
        for (let y = startY; y < startY + scale; y++) {
          for (let x = startX; x < startX + scale; x++) {
            const idx = (y * width + x) * 4;
            frameData[idx] = 0;       // R
            frameData[idx + 1] = 0;   // G
            frameData[idx + 2] = 0;   // B
            frameData[idx + 3] = 255; // A
          }
        }
      }
    }
  }

  const rawImageData = { data: frameData, width, height };
  // Encode with 95% quality (preserves sharp QR edges without compression artifacts)
  return jpeg.encode(rawImageData, 95).data;
}

// GET /api/emergency/:publicCode - Public emergency profile (Strictly Privacy-Filtered)
router.get('/:publicCode', async (req, res) => {
  try {
    const { publicCode } = req.params;

    if (!publicCode || typeof publicCode !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid public code supplied.',
      });
    }

    const pet = await Pet.findOne({ publicCode: publicCode.toUpperCase().trim() });
    if (!pet) {
      return res.status(404).json({
        success: false,
        message: 'No pet found matching this passport code. Please verify the QR code.',
      });
    }

    const privacy = pet.privacySettings || {};

    // STRICT BACKEND PRIVACY FILTERING: Only expose owner-approved attributes!
    const publicProfile = {
      publicCode: pet.publicCode,
      species: pet.species,
      status: pet.status, // SAFE, LOST, RECOVERED
      name: privacy.showNameBreed ? pet.name : 'Protected Identity',
      breed: privacy.showNameBreed ? pet.breed : '',
      photoUrl: privacy.showPhoto ? pet.photoUrl : '',
      emergencyPhone: privacy.showPhone ? pet.emergencyPhone : '',
      emergencyEmail: privacy.showEmail ? pet.emergencyEmail : '',
      medicalConditions: privacy.showMedical ? pet.conditions : '',
      allergies: privacy.showAllergies ? pet.allergies : '',
      specialCare: privacy.showSpecialCare ? pet.specialCare : '',
      microchip: pet.microchip ? `Registered (${pet.microchip.slice(0, 4)}...${pet.microchip.slice(-3)})` : '',
      lostDetails: pet.status === 'LOST' ? pet.lostDetails : null,
    };

    // Create scan alert notification for the pet owner
    try {
      await Notification.create({
        user: pet.owner,
        pet: pet._id,
        title: `🚨 Emergency Passport Scanned: ${pet.name}`,
        message: `Emergency QR profile was accessed for ${pet.name} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        type: 'alert',
        link: '#pets',
      });
    } catch (notifErr) {
      console.warn('[Scan Notification Warning]:', notifErr.message);
    }

    return res.json({
      success: true,
      profile: publicProfile,
    });
  } catch (error) {
    console.error('[Public Emergency Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve emergency profile.' });
  }
});

// GET /api/emergency/:publicCode/qr - High-contrast printable QR code data URL & destination URL
router.get('/:publicCode/qr', async (req, res) => {
  try {
    const { publicCode } = req.params;
    const pet = await Pet.findOne({ publicCode: publicCode.toUpperCase().trim() });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found.' });
    }

    // Construct the public URL destination
    const baseUrl = resolveBaseUrl(req);
    const publicUrl = `${baseUrl}/#emergency/${pet.publicCode}`;

    // High contrast black & white QR code for reliable scanning (no gold overlays inside code)
    const qrDataUrl = await QRCode.toDataURL(publicUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 360,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    return res.json({
      success: true,
      publicCode: pet.publicCode,
      publicUrl,
      qrDataUrl,
      jpgDownloadUrl: `/api/emergency/${pet.publicCode}/qr.jpg`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate QR code.' });
  }
});

// GET /api/emergency/:publicCode/qr.jpg - Download genuine binary JPG QR image
router.get('/:publicCode/qr.jpg', async (req, res) => {
  try {
    const { publicCode } = req.params;
    const pet = await Pet.findOne({ publicCode: publicCode.toUpperCase().trim() });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet not found.' });
    }

    const baseUrl = resolveBaseUrl(req);
    const publicUrl = `${baseUrl}/#emergency/${pet.publicCode}`;

    const jpegBuffer = generateQrJpegBuffer(publicUrl);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${pet.publicCode}_qr.jpg"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(jpegBuffer);
  } catch (error) {
    console.error('[Generate JPG QR Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate JPG QR image.' });
  }
});

// POST /api/emergency/:publicCode/report - Sighting report submission from public finder
router.post('/:publicCode/report', publicReportLimiter, async (req, res) => {
  try {
    const { publicCode } = req.params;
    const { finderName, finderContact, locationDescription, sightingDate, observations, message } = req.body;

    if (!locationDescription || locationDescription.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a location description where the pet was spotted.',
      });
    }

    const pet = await Pet.findOne({ publicCode: publicCode.toUpperCase().trim() });
    if (!pet) {
      return res.status(404).json({ success: false, message: 'Pet profile not found.' });
    }

    // Create report with input validation and reasonable length caps
    const report = await FoundReport.create({
      pet: pet._id,
      publicCode: pet.publicCode,
      finderName: finderName ? finderName.trim().slice(0, 100) : 'Anonymous Finder',
      finderContact: finderContact ? finderContact.trim().slice(0, 120) : '',
      locationDescription: locationDescription.trim().slice(0, 500),
      sightingDate: sightingDate ? new Date(sightingDate) : new Date(),
      observations: observations ? observations.trim().slice(0, 1000) : '',
      message: message ? message.trim().slice(0, 2000) : '',
      status: 'PENDING',
    });

    // Notify the pet owner immediately in-app
    await Notification.create({
      user: pet.owner,
      title: `URGENT Sighting Report for ${pet.name}`,
      message: `A sighting was reported at "${locationDescription.trim().slice(0, 80)}". Review the report in your Lost Pet Recovery Center.`,
      type: 'alert',
      link: '#lost-center',
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you so much! Your sighting report has been delivered to the pet owner.',
      reportId: report._id,
    });
  } catch (error) {
    console.error('[Public Sighting Report Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit sighting report.' });
  }
});

module.exports = router;
