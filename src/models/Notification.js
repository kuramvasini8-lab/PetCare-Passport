const { query } = require('../config/db');
const { SqlQuery, buildWhereClause } = require('./sqlHelper');

class Notification {
  constructor(row = {}) {
    this.id = row.id ? parseInt(row.id, 10) : undefined;
    this._id = row.id ? String(row.id) : undefined;
    const userVal = row.user_id !== undefined ? row.user_id : row.user;
    this.user = userVal ? (typeof userVal === 'object' ? userVal : String(userVal)) : '';
    this.user_id = this.user;
    this.pet = row.pet_id || null;
    this.title = row.title || '';
    this.message = row.message || '';
    this.type = row.type || 'info';
    this.isRead = Boolean(row.is_read !== undefined ? row.is_read : row.isRead);
    this.link = row.link_url || row.link || '';
    this.createdAt = row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date());
    this.updatedAt = row.updatedAt ? new Date(row.updatedAt) : new Date();
  }

  toObject() {
    return { ...this };
  }

  toJSON() {
    return { ...this };
  }

  async save() {
    const userId = typeof this.user === 'object' ? (this.user.id || this.user._id) : this.user;

    if (this.id) {
      await query(
        `UPDATE notifications SET
          user_id = ?, title = ?, message = ?, type = ?, is_read = ?, link_url = ?, link = ?
         WHERE id = ?`,
        [
          parseInt(userId, 10),
          this.title,
          this.message,
          this.type,
          this.isRead ? 1 : 0,
          this.link,
          this.link,
          this.id,
        ]
      );
      return this;
    } else {
      const created = await Notification.create(this);
      Object.assign(this, created);
      return this;
    }
  }

  static find(filter) {
    return new SqlQuery('notifications', filter, Notification);
  }

  static findOne(filter) {
    return new SqlQuery('notifications', filter, Notification, true);
  }

  static findById(id) {
    const parsedId = typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id;
    return new SqlQuery('notifications', { id: parsedId }, Notification, true);
  }

  static async countDocuments(filter = {}) {
    const { clause, params } = buildWhereClause('notifications', filter);
    const rows = await query(`SELECT COUNT(*) AS total FROM notifications ${clause}`, params);
    return rows[0] ? rows[0].total : 0;
  }

  static async create(data) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await Notification.create(item));
      }
      return results;
    }

    const userId = typeof data.user === 'object' ? (data.user.id || data.user._id) : (data.user || data.user_id);
    const petId = data.pet ? (typeof data.pet === 'object' ? (data.pet.id || data.pet._id) : data.pet) : null;

    const rows = await query(
      `INSERT INTO notifications (
        user_id, pet_id, title, message, type, is_read, link_url, link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(userId, 10),
        petId ? parseInt(petId, 10) : null,
        data.title || '',
        data.message || '',
        data.type || 'general',
        data.isRead ? 1 : 0,
        data.link || data.link_url || '',
        data.link || data.link_url || '',
      ]
    );

    return Notification.findById(rows.insertId);
  }

  static async findOneAndUpdate(filter, update, options = {}) {
    const notif = await Notification.findOne(filter);
    if (!notif) return null;

    if (update.isRead !== undefined) notif.isRead = Boolean(update.isRead);
    if (update.is_read !== undefined) notif.isRead = Boolean(update.is_read);
    if (update.title !== undefined) notif.title = update.title;
    if (update.message !== undefined) notif.message = update.message;
    if (update.type !== undefined) notif.type = update.type;
    if (update.link !== undefined) notif.link = update.link;

    await notif.save();
    return Notification.findById(notif.id);
  }

  static async updateMany(filter = {}, update = {}) {
    const { clause, params } = buildWhereClause('notifications', filter);
    const setClauses = [];
    const setParams = [];

    if (update.isRead !== undefined || update.is_read !== undefined) {
      setClauses.push('is_read = ?');
      const isR = update.isRead !== undefined ? update.isRead : update.is_read;
      setParams.push(isR ? 1 : 0);
    }

    if (setClauses.length === 0) return { modifiedCount: 0 };

    const sql = `UPDATE notifications SET ${setClauses.join(', ')} ${clause}`;
    await query(sql, [...setParams, ...params]);
    return { acknowledged: true };
  }

  static async deleteMany(filter = {}) {
    const { clause, params } = buildWhereClause('notifications', filter);
    if (!clause) {
      await query('DELETE FROM notifications');
    } else {
      await query(`DELETE FROM notifications ${clause}`, params);
    }
    return { acknowledged: true };
  }
}

module.exports = Notification;
