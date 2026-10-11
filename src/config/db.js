const mysql = require('mysql2/promise');

let pool = null;

async function connectDB() {
  const host = process.env.MYSQL_HOST;
  const port = Number(process.env.MYSQL_PORT);
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  const useSSL = process.env.MYSQL_SSL === 'true';

  if (!host || !port || !user || !password || !database) {
    throw new Error(
      'Missing required MySQL environment variables. Check MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.'
    );
  }

  console.log(`[Database] Connecting to MySQL at ${host}:${port}...`);

  try {
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      ...(useSSL
        ? {
            ssl: {
              rejectUnauthorized: true
            }
          }
        : {}),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    await pool.query('SELECT 1 AS connected');

    console.log('[Database] MySQL connection successful.');

    await initTables();

    const { runMigrations } = require('./migrate');
    await runMigrations(pool);

    console.log('[Database] Table initialization and migrations completed.');

    return { type: 'mysql', host, port, database };
  } catch (err) {
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }

    console.error(`[Database Critical] MySQL connection failed: ${err.message}`);
    throw err;
  }
}

async function initTables() {
  if (!pool) throw new Error('Database pool not initialized.');

  // USERS Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'OWNER',
      status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
      suspensionReason TEXT,
      suspendedAt DATETIME,
      suspendedBy INT,
      verificationStatus VARCHAR(40) NOT NULL DEFAULT 'UNVERIFIED',
      verificationNotes TEXT,
      phone VARCHAR(50) DEFAULT '',
      is_email_verified TINYINT(1) DEFAULT 0,
      otp_hash VARCHAR(255) NULL,
      otp_expires_at DATETIME NULL,
      otp_attempts INT DEFAULT 0,
      otp_last_sent_at DATETIME NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_users_email (email),
      INDEX idx_users_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // PETS Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner INT NOT NULL,
      publicCode VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      species VARCHAR(50) NOT NULL DEFAULT 'Dog',
      breed VARCHAR(100) DEFAULT '',
      dob DATETIME,
      gender VARCHAR(30) DEFAULT 'Unknown',
      weight DECIMAL(6,2),
      bloodGroup VARCHAR(30) DEFAULT '',
      photoUrl TEXT,
      microchip VARCHAR(80) DEFAULT '',
      neutered TINYINT(1) DEFAULT 0,
      allergies TEXT,
      conditions TEXT,
      specialCare TEXT,
      emergencyPhone VARCHAR(50) DEFAULT '',
      emergencyEmail VARCHAR(180) DEFAULT '',
      status VARCHAR(30) DEFAULT 'SAFE',
      lostDetails JSON,
      privacySettings JSON,
      flaggedForModeration TINYINT(1) DEFAULT 0,
      flagReason TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pets_owner (owner),
      INDEX idx_pets_publicCode (publicCode),
      INDEX idx_pets_status (status),
      FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // HEALTH RECORDS Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pet INT NOT NULL,
      owner INT NOT NULL,
      category VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      dueDate DATETIME,
      vetClinic VARCHAR(200) DEFAULT '',
      status VARCHAR(40) DEFAULT 'SCHEDULED',
      isCompleted TINYINT(1) DEFAULT 0,
      dosageInstructions TEXT,
      reaction TEXT,
      weightValue DECIMAL(6,2),
      notes TEXT,
      aiExplanation TEXT,
      verifiedByVet TINYINT(1) DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_health_pet (pet),
      INDEX idx_health_owner (owner),
      INDEX idx_health_category (category),
      FOREIGN KEY (pet) REFERENCES pets(id) ON DELETE CASCADE,
      FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // FOUND REPORTS Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS found_pet_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      pet INT NOT NULL,
      publicCode VARCHAR(50) NOT NULL,
      finderName VARCHAR(150) DEFAULT 'Anonymous Good Samaritan',
      finderContact VARCHAR(180) DEFAULT '',
      locationDescription TEXT NOT NULL,
      sightingDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      observations TEXT,
      message TEXT,
      status VARCHAR(40) DEFAULT 'PENDING',
      flagReason TEXT,
      moderationNotes TEXT,
      moderatedBy INT,
      reviewedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_reports_pet (pet),
      INDEX idx_reports_code (publicCode),
      INDEX idx_reports_status (status),
      FOREIGN KEY (pet) REFERENCES pets(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // NOTIFICATIONS Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(40) DEFAULT 'info',
      isRead TINYINT(1) DEFAULT 0,
      link VARCHAR(255) DEFAULT '',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_notif_user (user),
      INDEX idx_notif_read (isRead),
      FOREIGN KEY (user) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // AUDIT LOGS Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin INT,
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

  console.log(
  '[Database] All SQL tables (users, pets, health_records, found_pet_reports, notifications, audit_logs) verified.'
);
}

async function query(sql, params = []) {
  if (!pool) throw new Error('Database pool not connected.');
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function closeDB() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function getPool() {
  return pool;
}

module.exports = {
  connectDB,
  closeDB,
  query,
  getPool,
};
