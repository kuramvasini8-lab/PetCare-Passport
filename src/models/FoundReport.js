const { query } = require('../config/db');
const { SqlQuery, buildWhereClause } = require('./sqlHelper');

class FoundReport {
  constructor(row = {}) {
    this.id = row.id ? parseInt(row.id, 10) : undefined;
    this._id = row.id ? String(row.id) : undefined;
    const petVal = row.pet_id !== undefined ? row.pet_id : row.pet;
    this.pet = petVal ? (typeof petVal === 'object' ? petVal : String(petVal)) : '';
    this.pet_id = this.pet;
    this.publicCode = row.publicCode || '';
    this.finderName = row.finder_name || row.finderName || 'Anonymous Good Samaritan';
    this.finderContact = row.finder_phone || row.finderContact || '';
    this.finderEmail = row.finder_email || '';
    this.locationDescription = row.found_location || row.locationDescription || '';
    this.sightingDate = row.found_date ? new Date(row.found_date) : (row.sightingDate ? new Date(row.sightingDate) : new Date());
    this.observations = row.observations || '';
    this.message = row.message || '';
    const st = (row.status || 'pending').toLowerCase();
    this.status = st === 'pending' ? 'PENDING' : (st === 'contacted' ? 'REVIEWED' : (st === 'resolved' ? 'DISMISSED' : st.toUpperCase()));
    this.flagReason = row.flag_reason || row.flagReason || '';
    this.moderationNotes = row.moderation_notes || row.moderationNotes || '';
    this.moderatedBy = row.moderated_by ? String(row.moderated_by) : (row.moderatedBy ? String(row.moderatedBy) : null);
    this.reviewedAt = row.resolved_at ? new Date(row.resolved_at) : (row.reviewedAt ? new Date(row.reviewedAt) : null);
    this.createdAt = row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date());
    this.updatedAt = row.updated_at ? new Date(row.updated_at) : (row.updatedAt ? new Date(row.updatedAt) : new Date());
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return { ...this };
  }

  async save() {
    const petId = (this.pet && typeof this.pet === 'object') ? (this.pet.id || this.pet._id) : this.pet;
    const modById = (this.moderatedBy && typeof this.moderatedBy === 'object') ? (this.moderatedBy.id || this.moderatedBy._id) : this.moderatedBy;
    const st = (this.status || 'pending').toLowerCase();
    const dbStatus = st === 'pending' ? 'pending' : (st === 'reviewed' ? 'contacted' : 'resolved');

    if (this.id) {
      await query(
        `UPDATE found_pet_reports SET
          pet_id = ?, finder_name = ?, finder_phone = ?, finder_email = ?,
          found_location = ?, found_date = ?, message = ?, status = ?,
          observations = ?, flag_reason = ?, moderation_notes = ?,
          moderated_by = ?, resolved_at = ?
         WHERE id = ?`,
        [
          parseInt(petId, 10),
          this.finderName,
          this.finderContact,
          this.finderEmail,
          this.locationDescription,
          this.sightingDate,
          this.message,
          dbStatus,
          this.observations,
          this.flagReason,
          this.moderationNotes,
          modById ? parseInt(modById, 10) : null,
          this.reviewedAt,
          this.id,
        ]
      );
      return this;
    } else {
      const created = await FoundReport.create(this);
      Object.assign(this, created);
      return this;
    }
  }

  static find(filter) {
    return new SqlQuery('found_pet_reports', filter, FoundReport);
  }

  static findOne(filter) {
    return new SqlQuery('found_pet_reports', filter, FoundReport, true);
  }

  static findById(id) {
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    return new SqlQuery('found_pet_reports', { id: parsedId }, FoundReport, true);
  }

  static async countDocuments(filter = {}) {
    const { clause, params } = buildWhereClause('found_pet_reports', filter);
    const rows = await query(`SELECT COUNT(*) AS total FROM found_pet_reports ${clause}`, params);
    return rows[0] ? rows[0].total : 0;
  }

  static async create(data) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await FoundReport.create(item));
      }
      return results;
    }
    const petId = (data.pet && typeof data.pet === 'object') ? (data.pet.id || data.pet._id) : (data.pet || data.pet_id);
    const modById = (data.moderatedBy && typeof data.moderatedBy === 'object') ? (data.moderatedBy.id || data.moderatedBy._id) : data.moderatedBy;
    const st = (data.status || 'pending').toLowerCase();
    const dbStatus = st === 'pending' ? 'pending' : (st === 'reviewed' ? 'contacted' : 'resolved');

    const rows = await query(
      `INSERT INTO found_pet_reports (
        pet_id, finder_name, finder_phone, finder_email, found_location,
        found_date, message, status, observations, flag_reason,
        moderation_notes, moderated_by, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(petId, 10),
        data.finderName || data.finder_name || 'Anonymous Good Samaritan',
        data.finderContact || data.finder_phone || '',
        data.finderEmail || '',
        data.locationDescription || data.found_location || '',
        data.sightingDate ? new Date(data.sightingDate) : new Date(),
        data.message || '',
        dbStatus,
        data.observations || '',
        data.flagReason || '',
        data.moderationNotes || '',
        modById ? parseInt(modById, 10) : null,
        data.reviewedAt ? new Date(data.reviewedAt) : null,
      ]
    );

    return FoundReport.findById(rows.insertId);
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const report = await FoundReport.findById(id);
    if (!report) return null;

    for (const [key, val] of Object.entries(update)) {
      if (key === 'pet' || key === 'pet_id') {
        report.pet = typeof val === 'object' ? (val.id || val._id) : val;
      } else if (key === 'moderatedBy' || key === 'moderated_by') {
        report.moderatedBy = typeof val === 'object' ? (val.id || val._id) : val;
      } else if (val !== undefined) {
        report[key] = val;
      }
    }

    await report.save();
    return FoundReport.findById(id);
  }

  static async deleteMany(filter = {}) {
    const { clause, params } = buildWhereClause('found_pet_reports', filter);
    if (!clause) {
      await query('DELETE FROM found_pet_reports');
    } else {
      await query(`DELETE FROM found_pet_reports ${clause}`, params);
    }
    return { acknowledged: true };
  }
}

module.exports = FoundReport;
