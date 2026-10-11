const crypto = require('crypto');
const { query } = require('../config/db');
const { SqlQuery, buildWhereClause } = require('./sqlHelper');

class Pet {
  constructor(row = {}) {
    this.id = row.id ? parseInt(row.id, 10) : undefined;
    this._id = row.id ? String(row.id) : undefined;
    const ownerVal = row.user_id !== undefined ? row.user_id : row.owner;
    this.owner = ownerVal ? (typeof ownerVal === 'object' ? ownerVal : String(ownerVal)) : '';
    this.user_id = this.owner;
    this.publicCode = row.public_id || row.publicCode || ('PET-' + crypto.randomBytes(4).toString('hex').toUpperCase());
    this.public_id = this.publicCode;
    this.name = row.name || '';
    this.species = row.species || 'Dog';
    this.breed = row.breed || '';
    this.dob = row.dob ? new Date(row.dob) : null;
    this.gender = row.gender || 'Unknown';
    const weightVal = row.current_weight !== undefined ? row.current_weight : row.weight;
    this.weight = weightVal !== null && weightVal !== undefined ? parseFloat(weightVal) : null;
    this.color = row.color_markings || row.color || '';
    this.microchip = row.microchip_number || row.microchip || '';
    this.bloodGroup = row.blood_group || row.bloodGroup || '';
    this.neutered = row.sterilization_status === 'Neutered/Spayed' || Boolean(row.neutered);
    this.allergies = row.allergies || '';
    this.conditions = row.medical_conditions || row.conditions || '';
    this.medications = row.current_medications || '';
    this.specialCare = row.special_care_instructions || row.specialCare || '';
    this.photoUrl = row.photo_url || row.photoUrl || '';
    this.qrCodeUrl = row.qr_code_url || '';
    this.emergencyPhone = row.emergency_phone || row.emergencyPhone || '';
    this.emergencyEmail = row.emergency_email || row.emergencyEmail || '';
    this.status = row.status || 'SAFE';
    try {
      this.lostDetails = row.lost_details ? (typeof row.lost_details === 'string' ? JSON.parse(row.lost_details) : row.lost_details) : (row.lostDetails || null);
    } catch (_) {
      this.lostDetails = null;
    }
    this.isActive = row.is_active !== undefined ? Boolean(row.is_active) : true;
    this.flaggedForModeration = Boolean(row.flagged_for_moderation || row.flaggedForModeration);
    this.flagReason = row.flag_reason || row.flagReason || '';

    this.privacySettings = {
      showPhoto: true,
      showNameBreed: true,
      showMedical: true,
      showAllergies: true,
      showSpecialCare: true,
      showPhone: false,
      showEmail: false,
    };

    this.createdAt = row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date());
    this.updatedAt = row.updated_at ? new Date(row.updated_at) : (row.updatedAt ? new Date(row.updatedAt) : new Date());
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return { ...this };
  }

  async loadPrivacySettings() {
    if (!this.id) return;
    try {
      const rows = await query('SELECT * FROM emergency_privacy_settings WHERE pet_id = ? LIMIT 1', [this.id]);
      if (rows && rows.length > 0) {
        const s = rows[0];
        this.privacySettings = {
          showPhoto: Boolean(s.show_photo),
          showNameBreed: Boolean(s.show_name && s.show_species_breed),
          showMedical: Boolean(s.show_medical_alerts),
          showAllergies: Boolean(s.show_allergies),
          showSpecialCare: Boolean(s.show_special_care),
          showPhone: Boolean(s.show_emergency_phone),
          showEmail: Boolean(s.show_contact_form),
          customInstructions: s.custom_emergency_instructions || '',
        };
      }
    } catch (e) {
      console.warn('Failed to load privacy settings:', e.message);
    }
  }

  async savePrivacySettings() {
    if (!this.id) return;
    const s = this.privacySettings || {};
    try {
      await query(
        `INSERT INTO emergency_privacy_settings (
          pet_id, show_photo, show_name, show_species_breed, show_medical_alerts,
          show_allergies, show_special_care, show_emergency_phone, show_contact_form, custom_emergency_instructions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          show_photo = VALUES(show_photo),
          show_name = VALUES(show_name),
          show_species_breed = VALUES(show_species_breed),
          show_medical_alerts = VALUES(show_medical_alerts),
          show_allergies = VALUES(show_allergies),
          show_special_care = VALUES(show_special_care),
          show_emergency_phone = VALUES(show_emergency_phone),
          show_contact_form = VALUES(show_contact_form),
          custom_emergency_instructions = VALUES(custom_emergency_instructions)`,
        [
          this.id,
          s.showPhoto !== false ? 1 : 0,
          s.showNameBreed !== false ? 1 : 0,
          s.showNameBreed !== false ? 1 : 0,
          s.showMedical !== false ? 1 : 0,
          s.showAllergies !== false ? 1 : 0,
          s.showSpecialCare !== false ? 1 : 0,
          s.showPhone ? 1 : 0,
          s.showEmail !== false ? 1 : 0,
          s.customInstructions || '',
        ]
      );
    } catch (e) {
      console.warn('Failed to save privacy settings:', e.message);
    }
  }


  async save() {
    const ownerId = typeof this.owner === 'object' ? (this.owner.id || this.owner._id) : this.owner;
    const parsedOwnerId = parseInt(ownerId, 10);

    if (this.id) {
      await query(
        `UPDATE pets SET
          user_id = ?, public_id = ?, name = ?, species = ?, breed = ?, dob = ?,
          gender = ?, color_markings = ?, microchip_number = ?, blood_group = ?,
          current_weight = ?, sterilization_status = ?, allergies = ?,
          medical_conditions = ?, current_medications = ?, special_care_instructions = ?,
          photo_url = ?, emergency_phone = ?, emergency_email = ?,
          status = ?, lost_details = ?, is_active = ?, flagged_for_moderation = ?, flag_reason = ?
         WHERE id = ?`,
        [
          parsedOwnerId,
          this.publicCode,
          this.name,
          this.species,
          this.breed,
          this.dob,
          this.gender,
          this.color,
          this.microchip,
          this.bloodGroup,
          this.weight,
          this.neutered ? 'Neutered/Spayed' : 'Intact',
          this.allergies,
          this.conditions,
          this.medications,
          this.specialCare,
          this.photoUrl,
          this.emergencyPhone,
          this.emergencyEmail,
          this.status || 'SAFE',
          this.lostDetails ? JSON.stringify(this.lostDetails) : null,
          this.isActive ? 1 : 0,
          this.flaggedForModeration ? 1 : 0,
          this.flagReason,
          this.id,
        ]
      );
      await this.savePrivacySettings();
      return this;
    } else {
      const created = await Pet.create(this);
      Object.assign(this, created);
      return this;
    }
  }

  static find(filter) {
    return new SqlQuery('pets', filter, Pet);
  }

  static findOne(filter) {
    return new SqlQuery('pets', filter, Pet, true);
  }

  static findById(id) {
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    return new SqlQuery('pets', { id: parsedId }, Pet, true);
  }

  static async countDocuments(filter = {}) {
    const { clause, params } = buildWhereClause('pets', filter);
    const rows = await query(`SELECT COUNT(*) AS total FROM pets ${clause}`, params);
    return rows[0] ? rows[0].total : 0;
  }

  static async create(data) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await Pet.create(item));
      }
      return results;
    }
    const ownerId = typeof data.owner === 'object' ? (data.owner.id || data.owner._id) : (data.owner || data.user_id);
    const parsedOwnerId = parseInt(ownerId, 10);
    const publicCode = (data.publicCode || data.public_id || ('PET-' + crypto.randomBytes(4).toString('hex').toUpperCase())).toUpperCase().trim();

    const rows = await query(
      `INSERT INTO pets (
        user_id, public_id, name, species, breed, dob, gender, color_markings,
        microchip_number, blood_group, current_weight, sterilization_status,
        allergies, medical_conditions, current_medications, special_care_instructions,
        photo_url, emergency_phone, emergency_email, status, lost_details, is_active,
        flagged_for_moderation, flag_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        parsedOwnerId,
        publicCode,
        data.name || '',
        data.species || 'Dog',
        data.breed || '',
        data.dob ? new Date(data.dob) : null,
        data.gender || 'Unknown',
        data.color || data.color_markings || '',
        data.microchip || data.microchip_number || '',
        data.bloodGroup || data.blood_group || '',
        data.weight !== undefined && data.weight !== null ? parseFloat(data.weight) : (data.current_weight ? parseFloat(data.current_weight) : null),
        data.neutered ? 'Neutered/Spayed' : (data.sterilization_status || 'Intact'),
        data.allergies || '',
        data.conditions || data.medical_conditions || '',
        data.medications || data.current_medications || '',
        data.specialCare || data.special_care_instructions || '',
        data.photoUrl || data.photo_url || '',
        data.emergencyPhone || data.emergency_phone || '',
        data.emergencyEmail || data.emergency_email || '',
        data.status || 'SAFE',
        data.lostDetails ? JSON.stringify(data.lostDetails) : null,
        data.flaggedForModeration ? 1 : 0,
        data.flagReason || '',
      ]
    );

    const newPet = await Pet.findById(rows.insertId);
    if (data.privacySettings && newPet) {
      newPet.privacySettings = { ...newPet.privacySettings, ...data.privacySettings };
      await newPet.savePrivacySettings();
    }
    return newPet;
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const pet = await Pet.findById(id);
    if (!pet) return null;

    for (const [key, val] of Object.entries(update)) {
      if (key === 'owner' || key === 'user_id') {
        pet.owner = typeof val === 'object' ? (val.id || val._id) : val;
      } else if (key === 'privacySettings') {
        pet.privacySettings = { ...pet.privacySettings, ...val };
      } else if (key === 'weight' || key === 'current_weight') {
        pet.weight = val !== null && val !== undefined ? parseFloat(val) : null;
      } else if (key === 'neutered') {
        pet.neutered = Boolean(val);
      } else if (key === 'status') {
        pet.status = val;
      } else if (key === 'lostDetails') {
        pet.lostDetails = val;
      } else if (val !== undefined) {
        pet[key] = val;
      }
    }

    await pet.save();
    return Pet.findById(id);
  }

  static async findByIdAndDelete(id) {
    const pet = await Pet.findById(id);
    if (!pet) return null;
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    await query('DELETE FROM pets WHERE id = ?', [parsedId]);
    return pet;
  }
}

module.exports = Pet;
