const { query } = require('../config/db');
const { SqlQuery, buildWhereClause } = require('./sqlHelper');

class HealthRecord {
  constructor(row = {}) {
    this.id = row.id ? parseInt(row.id, 10) : undefined;
    this._id = row.id ? String(row.id) : undefined;
    const petVal = row.pet_id !== undefined ? row.pet_id : row.pet;
    this.pet = petVal ? (typeof petVal === 'object' ? petVal : String(petVal)) : '';
    this.pet_id = this.pet;
    this.owner = row.user_id !== undefined ? String(row.user_id) : (row.owner ? String(row.owner) : '');
    this.category = (row.category || 'VACCINATION').toUpperCase();
    this.title = row.title || '';
    this.date = row.date_administered ? new Date(row.date_administered) : (row.date ? new Date(row.date) : new Date());
    this.dueDate = row.next_due_date ? new Date(row.next_due_date) : (row.dueDate ? new Date(row.dueDate) : null);
    this.vetClinic = row.clinic_name || row.vetClinic || '';
    this.veterinarianName = row.veterinarian_name || '';
    this.status = row.status || 'SCHEDULED';
    this.isCompleted = Boolean(row.is_completed || row.isCompleted);
    this.dosageInstructions = row.dosage || row.dosageInstructions || '';
    this.reaction = row.reaction || '';
    const weightVal = row.weight_value !== undefined ? row.weight_value : row.weightValue;
    this.weightValue = weightVal !== null && weightVal !== undefined ? parseFloat(weightVal) : null;
    this.notes = row.instructions_notes || row.notes || '';
    this.aiExplanation = row.ai_explanation || row.aiExplanation || '';
    this.verifiedByVet = Boolean(row.verified_by_vet || row.verifiedByVet);
    this.createdAt = row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date());
    this.updatedAt = row.updated_at ? new Date(row.updated_at) : (row.updatedAt ? new Date(row.updatedAt) : new Date());
  }

  calculateVaccinationStatus() {
    if (this.category !== 'VACCINATION') return this.status;

    if (this.isCompleted) {
      return 'COMPLETED';
    }

    if (!this.dueDate) {
      return 'UNSCHEDULED';
    }

    const now = new Date();
    const due = new Date(this.dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'OVERDUE';
    } else if (diffDays <= 7) {
      return 'UPCOMING';
    } else {
      return 'SCHEDULED';
    }
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return { ...this };
  }

  async save() {
    const petId = typeof this.pet === 'object' ? (this.pet.id || this.pet._id) : this.pet;
    const ownerId = typeof this.owner === 'object' ? (this.owner.id || this.owner._id) : (this.owner || this.user_id);
    const parsedOwnerId = ownerId ? parseInt(ownerId, 10) : null;

    if (this.id) {
      await query(
        `UPDATE health_records SET
          user_id = ?, pet_id = ?, category = ?, title = ?, date_administered = ?, next_due_date = ?,
          clinic_name = ?, veterinarian_name = ?, dosage = ?, status = ?,
          is_completed = ?, instructions_notes = ?, notes = ?, ai_explanation = ?,
          verified_by_vet = ?, reaction = ?, weight_value = ?
         WHERE id = ?`,
        [
          parsedOwnerId,
          parseInt(petId, 10),
          this.category.toLowerCase(),
          this.title,
          this.date,
          this.dueDate,
          this.vetClinic,
          this.veterinarianName,
          this.dosageInstructions,
          this.status,
          this.isCompleted ? 1 : 0,
          this.notes,
          this.notes,
          this.aiExplanation,
          this.verifiedByVet ? 1 : 0,
          this.reaction,
          this.weightValue,
          this.id,
        ]
      );
      return this;
    } else {
      const created = await HealthRecord.create(this);
      Object.assign(this, created);
      return this;
    }
  }

  static find(filter) {
    return new SqlQuery('health_records', filter, HealthRecord);
  }

  static findOne(filter) {
    return new SqlQuery('health_records', filter, HealthRecord, true);
  }

  static findById(id) {
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    return new SqlQuery('health_records', { id: parsedId }, HealthRecord, true);
  }

  static async countDocuments(filter = {}) {
    const { clause, params } = buildWhereClause('health_records', filter);
    const rows = await query(`SELECT COUNT(*) AS total FROM health_records ${clause}`, params);
    return rows[0] ? rows[0].total : 0;
  }

  static async create(data) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await HealthRecord.create(item));
      }
      return results;
    }
    const petId = typeof data.pet === 'object' ? (data.pet.id || data.pet._id) : (data.pet || data.pet_id);
    const ownerId = data.owner ? (typeof data.owner === 'object' ? (data.owner.id || data.owner._id) : data.owner) : (data.user_id || null);
    const parsedOwnerId = ownerId ? parseInt(ownerId, 10) : null;
    const cat = (data.category || 'VACCINATION').toLowerCase();

    const rows = await query(
      `INSERT INTO health_records (
        user_id, pet_id, category, title, date_administered, next_due_date, clinic_name,
        veterinarian_name, dosage, status, is_completed, instructions_notes,
        notes, ai_explanation, verified_by_vet, reaction, weight_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parsedOwnerId,
        parseInt(petId, 10),
        cat,
        data.title || '',
        data.date ? new Date(data.date) : new Date(),
        data.dueDate ? new Date(data.dueDate) : null,
        data.vetClinic || data.clinic_name || '',
        data.veterinarianName || data.veterinarian_name || '',
        data.dosageInstructions || data.dosage || '',
        data.status || 'SCHEDULED',
        data.isCompleted ? 1 : 0,
        data.notes || '',
        data.notes || '',
        data.aiExplanation || '',
        data.verifiedByVet ? 1 : 0,
        data.reaction || '',
        data.weightValue !== undefined && data.weightValue !== null ? parseFloat(data.weightValue) : null,
      ]
    );

    return HealthRecord.findById(rows.insertId);
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const record = await HealthRecord.findById(id);
    if (!record) return null;

    for (const [key, val] of Object.entries(update)) {
      if (key === 'pet' || key === 'pet_id') {
        record.pet = typeof val === 'object' ? (val.id || val._id) : val;
      } else if (key === 'isCompleted') {
        record.isCompleted = Boolean(val);
      } else if (key === 'dueDate') {
        record.dueDate = val ? new Date(val) : null;
      } else if (key === 'date') {
        record.date = val ? new Date(val) : new Date();
      } else if (val !== undefined) {
        record[key] = val;
      }
    }

    await record.save();
    return HealthRecord.findById(id);
  }

  static async findByIdAndDelete(id) {
    const record = await HealthRecord.findById(id);
    if (!record) return null;
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    await query('DELETE FROM health_records WHERE id = ?', [parsedId]);
    return record;
  }

  static async deleteMany(filter = {}) {
    const { clause, params } = buildWhereClause('health_records', filter);
    if (!clause) {
      await query('DELETE FROM health_records');
    } else {
      await query(`DELETE FROM health_records ${clause}`, params);
    }
    return { acknowledged: true };
  }
}

module.exports = HealthRecord;
