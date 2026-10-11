const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { SqlQuery, buildWhereClause } = require('./sqlHelper');

class User {
  constructor(row = {}) {
    this.id = row.id ? parseInt(row.id, 10) : undefined;
    this._id = row.id ? String(row.id) : undefined;
    this.name = row.full_name || row.name || '';
    this.email = (row.email || '').toLowerCase().trim();
    this.password = row.password_hash || row.password || '';
    this.phone = row.phone || '';
    this.role = row.role || 'OWNER';
    this.status = row.status || 'ACTIVE';
    this.suspensionReason = row.suspensionReason || '';
    this.suspendedAt = row.suspendedAt ? new Date(row.suspendedAt) : null;
    this.suspendedBy = row.suspendedBy || null;
    this.verificationStatus = row.verificationStatus || 'UNVERIFIED';
    this.verificationNotes = row.verificationNotes || '';
    this.isEmailVerified = Boolean(row.is_email_verified !== undefined ? row.is_email_verified : row.isEmailVerified);
    this.otpHash = row.otp_hash || row.otpHash || null;
    this.otpExpiresAt = row.otp_expires_at ? new Date(row.otp_expires_at) : (row.otpExpiresAt ? new Date(row.otpExpiresAt) : null);
    this.otpAttempts = row.otp_attempts !== undefined ? parseInt(row.otp_attempts, 10) : (row.otpAttempts !== undefined ? parseInt(row.otpAttempts, 10) : 0);
    this.otpLastSentAt = row.otp_last_sent_at ? new Date(row.otp_last_sent_at) : (row.otpLastSentAt ? new Date(row.otpLastSentAt) : null);
    this.createdAt = row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date());
    this.updatedAt = row.updated_at ? new Date(row.updated_at) : (row.updatedAt ? new Date(row.updatedAt) : new Date());
  }

  async comparePassword(candidatePassword) {
    if (!this.password || !candidatePassword) return false;
    return bcrypt.compare(candidatePassword, this.password);
  }

  toJSON() {
    const obj = { ...this };
    delete obj.password;
    delete obj.otpHash;
    return obj;
  }

  toObject() {
    return this.toJSON();
  }

  async save() {
    if (this.id) {
      await query(
        `UPDATE users SET
          full_name = ?, email = ?, password_hash = ?, phone = ?, role = ?, status = ?,
          suspensionReason = ?, suspendedAt = ?, suspendedBy = ?,
          verificationStatus = ?, verificationNotes = ?,
          is_email_verified = ?, otp_hash = ?, otp_expires_at = ?, otp_attempts = ?, otp_last_sent_at = ?
         WHERE id = ?`,
        [
          this.name,
          this.email,
          this.password,
          this.phone,
          this.role,
          this.status,
          this.suspensionReason,
          this.suspendedAt,
          this.suspendedBy,
          this.verificationStatus,
          this.verificationNotes,
          this.isEmailVerified ? 1 : 0,
          this.otpHash,
          this.otpExpiresAt,
          this.otpAttempts,
          this.otpLastSentAt,
          this.id,
        ]
      );
      return this;
    } else {
      const created = await User.create(this);
      Object.assign(this, created);
      return this;
    }
  }

  static find(filter) {
    return new SqlQuery('users', filter, User);
  }

  static findOne(filter) {
    return new SqlQuery('users', filter, User, true);
  }

  static findById(id) {
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    return new SqlQuery('users', { id: parsedId }, User, true);
  }

  static async countDocuments(filter = {}) {
    const { clause, params } = buildWhereClause('users', filter);
    const rows = await query(`SELECT COUNT(*) AS total FROM users ${clause}`, params);
    return rows[0] ? rows[0].total : 0;
  }

  static async create(data) {
    let hashedPassword = data.password || data.password_hash;
    if (hashedPassword && !hashedPassword.startsWith('$2a$') && !hashedPassword.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(hashedPassword, salt);
    }

    const email = (data.email || '').toLowerCase().trim();
    const rows = await query(
      `INSERT INTO users (
        full_name, email, password_hash, phone, role, status,
        suspensionReason, suspendedAt, suspendedBy, verificationStatus, verificationNotes,
        is_email_verified, otp_hash, otp_expires_at, otp_attempts, otp_last_sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name || data.full_name || '',
        email,
        hashedPassword,
        data.phone || '',
        data.role || 'OWNER',
        data.status || 'ACTIVE',
        data.suspensionReason || '',
        data.suspendedAt || null,
        data.suspendedBy || null,
        data.verificationStatus || 'UNVERIFIED',
        data.verificationNotes || '',
        data.isEmailVerified ? 1 : 0,
        data.otpHash || null,
        data.otpExpiresAt || null,
        data.otpAttempts || 0,
        data.otpLastSentAt || null,
      ]
    );

    return User.findById(rows.insertId);
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    const user = await User.findById(id);
    if (!user) return null;

    if (update.name !== undefined) user.name = update.name;
    if (update.full_name !== undefined) user.name = update.full_name;
    if (update.email !== undefined) user.email = update.email.toLowerCase().trim();
    if (update.password !== undefined) {
      if (!update.password.startsWith('$2a$') && !update.password.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(update.password, salt);
      } else {
        user.password = update.password;
      }
    }
    if (update.phone !== undefined) user.phone = update.phone;
    if (update.role !== undefined) user.role = update.role;
    if (update.status !== undefined) user.status = update.status;
    if (update.suspensionReason !== undefined) user.suspensionReason = update.suspensionReason;
    if (update.suspendedAt !== undefined) user.suspendedAt = update.suspendedAt;
    if (update.suspendedBy !== undefined) user.suspendedBy = update.suspendedBy;
    if (update.verificationStatus !== undefined) user.verificationStatus = update.verificationStatus;
    if (update.verificationNotes !== undefined) user.verificationNotes = update.verificationNotes;
    if (update.isEmailVerified !== undefined) user.isEmailVerified = Boolean(update.isEmailVerified);
    if (update.otpHash !== undefined) user.otpHash = update.otpHash;
    if (update.otpExpiresAt !== undefined) user.otpExpiresAt = update.otpExpiresAt;
    if (update.otpAttempts !== undefined) user.otpAttempts = update.otpAttempts;
    if (update.otpLastSentAt !== undefined) user.otpLastSentAt = update.otpLastSentAt;

    await user.save();
    return User.findById(id);
  }
}

module.exports = User;
