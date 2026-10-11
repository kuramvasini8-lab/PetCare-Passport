const { query } = require('../config/db');

// Mapping of Model filter fields to MySQL column names per table
const COLUMN_MAPPINGS = {
  users: {
    _id: 'id',
    name: 'full_name',
    password: 'password_hash',
    isEmailVerified: 'is_email_verified',
    otpHash: 'otp_hash',
    otpExpiresAt: 'otp_expires_at',
    otpAttempts: 'otp_attempts',
    otpLastSentAt: 'otp_last_sent_at',
  },
  pets: {
    _id: 'id',
    owner: 'user_id',
    publicCode: 'public_id',
    weight: 'current_weight',
    microchip: 'microchip_number',
    bloodGroup: 'blood_group',
    photoUrl: 'photo_url',
    conditions: 'medical_conditions',
    specialCare: 'special_care_instructions',
    emergencyPhone: 'emergency_phone',
    emergencyEmail: 'emergency_email',
    lostDetails: 'lost_details',
  },
  health_records: {
    _id: 'id',
    pet: 'pet_id',
    owner: 'user_id',
    date: 'date_administered',
    dueDate: 'next_due_date',
    vetClinic: 'clinic_name',
    notes: 'instructions_notes',
    aiExplanation: 'ai_explanation',
    verifiedByVet: 'verified_by_vet',
  },
  found_pet_reports: {
    _id: 'id',
    pet: 'pet_id',
    finderName: 'finder_name',
    finderContact: 'finder_phone',
    locationDescription: 'found_location',
    sightingDate: 'found_date',
  },
  notifications: {
    _id: 'id',
    user: 'user_id',
    pet: 'pet_id',
    isRead: 'is_read',
    link: 'link_url',
  },
  audit_logs: {
    _id: 'id',
  },
};

function mapColumn(table, field) {
  const tableMap = COLUMN_MAPPINGS[table] || {};
  if (tableMap[field]) return tableMap[field];
  if (table !== 'audit_logs') {
    if (field === 'createdAt') return 'created_at';
    if (field === 'updatedAt') return 'updated_at';
  }
  return field;
}

function buildWhereClause(table, filter = {}) {
  const conditions = [];
  const params = [];

  if (!filter || typeof filter !== 'object') {
    return { clause: '', params: [] };
  }

  for (const [rawKey, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    const col = mapColumn(table, rawKey);

    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if ('$ne' in value) {
        conditions.push(`\`${col}\` != ?`);
        params.push(value.$ne);
      } else if ('$in' in value) {
        const inVals = Array.isArray(value.$in) ? value.$in : [value.$in];
        if (inVals.length === 0) {
          conditions.push('1 = 0');
        } else {
          const placeholders = inVals.map(() => '?').join(', ');
          conditions.push(`\`${col}\` IN (${placeholders})`);
          params.push(...inVals.map((v) => (typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : v)));
        }
      }
    } else {
      let finalVal = value;
      if (typeof finalVal === 'boolean') {
        finalVal = finalVal ? 1 : 0;
      } else if (typeof finalVal === 'string' && (col === 'id' || col === 'user_id' || col === 'pet_id') && /^\d+$/.test(finalVal)) {
        finalVal = parseInt(finalVal, 10);
      }
      conditions.push(`\`${col}\` = ?`);
      params.push(finalVal);
    }
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

class SqlQuery {
  constructor(tableName, baseFilter, ModelClass, isSingle = false) {
    this.tableName = tableName;
    this.filter = baseFilter || {};
    this.ModelClass = ModelClass;
    this.isSingle = isSingle;
    this._sort = '';
    this._limit = null;
    this._offset = null;
    this._populates = [];
  }

  sort(sortObj) {
    if (!sortObj) return this;
    if (typeof sortObj === 'string') {
      const parts = sortObj.split(' ');
      const clauses = parts.map((p) => {
        const desc = p.startsWith('-');
        const field = desc ? p.slice(1) : p;
        const col = mapColumn(this.tableName, field);
        return `\`${col}\` ${desc ? 'DESC' : 'ASC'}`;
      });
      this._sort = clauses.join(', ');
      return this;
    }
    const clauses = [];
    for (const [key, dir] of Object.entries(sortObj)) {
      const col = mapColumn(this.tableName, key);
      const order = dir === -1 || dir === 'desc' || dir === 'DESC' ? 'DESC' : 'ASC';
      clauses.push(`\`${col}\` ${order}`);
    }
    this._sort = clauses.join(', ');
    return this;
  }

  limit(n) {
    this._limit = parseInt(n, 10);
    return this;
  }

  skip(n) {
    this._offset = parseInt(n, 10);
    return this;
  }

  populate(path, select) {
    this._populates.push({ path, select });
    return this;
  }

  select() {
    return this;
  }

  async exec() {
    const { clause, params } = buildWhereClause(this.tableName, this.filter);
    let sql = `SELECT * FROM \`${this.tableName}\` ${clause}`;

    if (this._sort) {
      sql += ` ORDER BY ${this._sort}`;
    }

    if (this.isSingle) {
      sql += ` LIMIT 1`;
    } else {
      if (this._limit !== null) {
        sql += ` LIMIT ${this._limit}`;
        if (this._offset !== null) {
          sql += ` OFFSET ${this._offset}`;
        }
      }
    }

    const rows = await query(sql, params);

    if (this.isSingle) {
      if (rows.length === 0) return null;
      const instance = new this.ModelClass(rows[0]);
      if (typeof instance.loadPrivacySettings === 'function') {
        await instance.loadPrivacySettings();
      }
      await this._applyPopulates([instance]);
      return instance;
    }

    const instances = rows.map((r) => new this.ModelClass(r));
    for (const inst of instances) {
      if (typeof inst.loadPrivacySettings === 'function') {
        await inst.loadPrivacySettings();
      }
    }
    await this._applyPopulates(instances);
    return instances;
  }

  async _applyPopulates(instances) {
    if (this._populates.length === 0 || instances.length === 0) return;

    for (const pop of this._populates) {
      if (pop.path === 'pet') {
        const petIds = [...new Set(instances.map((i) => i.pet || i.pet_id).filter(Boolean))];
        if (petIds.length > 0) {
          const placeholders = petIds.map(() => '?').join(', ');
          const petRows = await query(`SELECT * FROM pets WHERE id IN (${placeholders})`, petIds);
          const Pet = require('./Pet');
          const petMap = new Map(petRows.map((r) => [r.id, new Pet(r)]));
          for (const inst of instances) {
            const pid = parseInt(inst.pet || inst.pet_id, 10);
            inst.pet = petMap.get(pid) || null;
          }
        }
      } else if (pop.path === 'owner' || pop.path === 'user') {
        const userIds = [...new Set(instances.map((i) => i.owner || i.user || i.user_id).filter(Boolean))];
        if (userIds.length > 0) {
          const placeholders = userIds.map(() => '?').join(', ');
          const userRows = await query(`SELECT * FROM users WHERE id IN (${placeholders})`, userIds);
          const User = require('./User');
          const userMap = new Map(userRows.map((r) => [r.id, new User(r)]));
          for (const inst of instances) {
            const uid = parseInt(inst.owner || inst.user || inst.user_id, 10);
            if (pop.path === 'owner') inst.owner = userMap.get(uid) || null;
            if (pop.path === 'user') inst.user = userMap.get(uid) || null;
          }
        }
      } else if (pop.path === 'moderatedBy') {
        const userIds = [...new Set(instances.map((i) => i.moderatedBy || i.moderated_by).filter(Boolean))];
        if (userIds.length > 0) {
          const placeholders = userIds.map(() => '?').join(', ');
          const userRows = await query(`SELECT * FROM users WHERE id IN (${placeholders})`, userIds);
          const User = require('./User');
          const userMap = new Map(userRows.map((r) => [r.id, new User(r)]));
          for (const inst of instances) {
            const uid = parseInt(inst.moderatedBy || inst.moderated_by, 10);
            inst.moderatedBy = userMap.get(uid) || null;
          }
        }
      }
    }
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

module.exports = {
  COLUMN_MAPPINGS,
  mapColumn,
  buildWhereClause,
  SqlQuery,
};
