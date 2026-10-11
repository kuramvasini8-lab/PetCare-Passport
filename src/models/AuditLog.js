const { query } = require('../config/db');
const { SqlQuery, buildWhereClause } = require('./sqlHelper');

class AuditLog {
  constructor(row = {}) {
    this.id = row.id ? parseInt(row.id, 10) : undefined;
    this._id = row.id ? String(row.id) : undefined;
    this.admin = row.admin ? (typeof row.admin === 'object' ? row.admin : String(row.admin)) : null;
    this.adminEmail = row.adminEmail || '';
    this.action = row.action || '';
    this.targetType = row.targetType || 'System';
    this.targetId = row.targetId || '';
    this.reason = row.reason || '';

    let details = row.details;
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch (e) { details = {}; }
    }
    this.details = details || {};

    this.createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
  }

  static find(filter) {
    return new SqlQuery('audit_logs', filter, AuditLog);
  }

  static findOne(filter) {
    return new SqlQuery('audit_logs', filter, AuditLog, true);
  }

  static findById(id) {
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    return new SqlQuery('audit_logs', { id: parsedId }, AuditLog, true);
  }

  static async countDocuments(filter = {}) {
    const { clause, params } = buildWhereClause(filter);
    const rows = await query(`SELECT COUNT(*) AS total FROM audit_logs ${clause}`, params);
    return rows[0] ? rows[0].total : 0;
  }

  static async create(data) {
    const adminId = data.admin ? (typeof data.admin === 'object' ? (data.admin.id || data.admin._id) : data.admin) : null;

    const rows = await query(
      `INSERT INTO audit_logs (
        admin, adminEmail, action, targetType, targetId, reason, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId ? parseInt(adminId, 10) : null,
        data.adminEmail || '',
        data.action || '',
        data.targetType || 'System',
        data.targetId || '',
        data.reason || '',
        JSON.stringify(data.details || {}),
      ]
    );

    return AuditLog.findById(rows.insertId);
  }
}

module.exports = AuditLog;
