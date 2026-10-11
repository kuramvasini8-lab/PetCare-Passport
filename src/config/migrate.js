async function runMigrations(pool) {
  async function hasColumn(table, column) {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return cols.length > 0;
  }

  async function addColumnIfMissing(table, column, definition) {
    const exists = await hasColumn(table, column);
    if (!exists) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`[Migration] Added column ${column} to table ${table}`);
    }
  }

  // 1. Users table
  await addColumnIfMissing('users', 'role', "VARCHAR(30) NOT NULL DEFAULT 'OWNER'");
  await addColumnIfMissing('users', 'status', "VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'");
  await addColumnIfMissing('users', 'suspensionReason', 'TEXT NULL');
  await addColumnIfMissing('users', 'suspendedAt', 'DATETIME NULL');
  await addColumnIfMissing('users', 'suspendedBy', 'INT NULL');
  await addColumnIfMissing('users', 'verificationStatus', "VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED'");
  await addColumnIfMissing('users', 'verificationNotes', 'TEXT NULL');
  await addColumnIfMissing('users', 'is_email_verified', 'TINYINT(1) DEFAULT 0');
  await addColumnIfMissing('users', 'otp_hash', 'VARCHAR(255) NULL');
  await addColumnIfMissing('users', 'otp_expires_at', 'DATETIME NULL');
  await addColumnIfMissing('users', 'otp_attempts', 'INT DEFAULT 0');
  await addColumnIfMissing('users', 'otp_last_sent_at', 'DATETIME NULL');

  try {
    await pool.query("UPDATE users SET is_email_verified = 1 WHERE verificationStatus = 'VERIFIED' OR role = 'ADMIN'");
  } catch (_) {}

  // 2. Pets table
  await addColumnIfMissing('pets', 'emergency_phone', "VARCHAR(50) DEFAULT ''");
  await addColumnIfMissing('pets', 'emergency_email', "VARCHAR(180) DEFAULT ''");
  await addColumnIfMissing('pets', 'status', "VARCHAR(30) DEFAULT 'SAFE'");
  await addColumnIfMissing('pets', 'lost_details', 'JSON NULL');
  await addColumnIfMissing('pets', 'flagged_for_moderation', 'TINYINT(1) DEFAULT 0');
  await addColumnIfMissing('pets', 'flag_reason', 'TEXT NULL');

  // 3. Health records table
  await addColumnIfMissing('health_records', 'user_id', 'INT NULL');
  // Adjust category to accept uppercase or lowercase
  try {
    await pool.query('ALTER TABLE health_records MODIFY COLUMN category VARCHAR(60) NOT NULL');
  } catch (e) {}
  await addColumnIfMissing('health_records', 'status', "VARCHAR(40) DEFAULT 'SCHEDULED'");
  await addColumnIfMissing('health_records', 'is_completed', 'TINYINT(1) DEFAULT 0');
  await addColumnIfMissing('health_records', 'notes', 'TEXT NULL');
  await addColumnIfMissing('health_records', 'ai_explanation', 'TEXT NULL');
  await addColumnIfMissing('health_records', 'verified_by_vet', 'TINYINT(1) DEFAULT 0');
  await addColumnIfMissing('health_records', 'reaction', 'TEXT NULL');
  await addColumnIfMissing('health_records', 'weight_value', 'DECIMAL(6,2) NULL');

  // 4. Notifications table
  try {
    await pool.query("ALTER TABLE notifications MODIFY COLUMN type VARCHAR(50) DEFAULT 'general'");
  } catch (e) {}
  await addColumnIfMissing('notifications', 'link_url', "VARCHAR(255) DEFAULT ''");
  await addColumnIfMissing('notifications', 'link', "VARCHAR(255) DEFAULT ''");

  // 5. Found pet reports table
  try {
    await pool.query("ALTER TABLE found_pet_reports MODIFY COLUMN status VARCHAR(40) DEFAULT 'pending'");
  } catch (e) {}
  await addColumnIfMissing('found_pet_reports', 'observations', 'TEXT NULL');
  await addColumnIfMissing('found_pet_reports', 'flag_reason', 'TEXT NULL');
  await addColumnIfMissing('found_pet_reports', 'moderation_notes', 'TEXT NULL');
  await addColumnIfMissing('found_pet_reports', 'moderated_by', 'INT NULL');

  // 6. Audit logs table (create if not exists)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin INT DEFAULT NULL,
      adminEmail VARCHAR(180) NOT NULL,
      action VARCHAR(80) NOT NULL,
      targetType VARCHAR(50) NOT NULL,
      targetId VARCHAR(80) NOT NULL,
      reason TEXT,
      details JSON,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_admin (admin),
      INDEX idx_audit_action (action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('[Migration] Database schema verification completed.');
}

module.exports = { runMigrations };
