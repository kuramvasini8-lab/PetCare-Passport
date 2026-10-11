/**
 * Test Suite: Email OTP Verification End-to-End
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:3000';

async function runOtpTests() {
  console.log('🐾 ====================================================');
  console.log('🐾 STARTING PETCARE PASSPORT OTP VERIFICATION TESTS');
  console.log('🐾 ====================================================\n');

  // Connect to DB directly to verify security & read hashes
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT, 10) || 3366,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'kuram@6281',
    database: process.env.MYSQL_DATABASE || 'petcare_passport',
  });

  const timestamp = Date.now();
  const testEmail = `petparent_${timestamp}@testdomain.org`;
  const testPassword = 'SecurePetPass2026!';
  const testName = 'Alex Mercer';

  console.log(`[TEST 1] Registering new user: ${testEmail}...`);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: testName,
      email: testEmail,
      password: testPassword,
      phone: '+1 555-0199',
    }),
  });

  const regData = await regRes.json();
  console.log(`HTTP Status: ${regRes.status}`, regData);

  if (regRes.status !== 201 || !regData.requiresVerification || regData.token) {
    throw new Error('TEST 1 FAILED: Expected 201 with requiresVerification: true and NO token.');
  }
  console.log('✅ TEST 1 PASSED: User registered, requiresVerification is true, token withheld.\n');

  console.log('[TEST 2] Checking Database Security (Never store plaintext OTP)...');
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [testEmail]);
  if (!rows.length) throw new Error('User not found in MySQL.');
  const dbUser = rows[0];

  console.log(`Database Record: is_email_verified = ${dbUser.is_email_verified}, otp_hash = ${dbUser.otp_hash.substring(0, 15)}...`);
  console.log(`OTP expires at: ${dbUser.otp_expires_at}, attempts: ${dbUser.otp_attempts}`);

  if (dbUser.is_email_verified !== 0) throw new Error('TEST 2 FAILED: is_email_verified should be 0.');
  if (!dbUser.otp_hash || !dbUser.otp_hash.startsWith('$2')) throw new Error('TEST 2 FAILED: OTP must be bcrypt hashed, never plaintext!');
  console.log('✅ TEST 2 PASSED: MySQL stores bcrypt hash only, never plaintext OTP.\n');

  console.log('[TEST 3] Verifying Login is Blocked for Unverified User...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const loginData = await loginRes.json();
  console.log(`HTTP Status: ${loginRes.status}`, loginData);

  if (loginRes.status !== 403 || !loginData.requiresVerification) {
    throw new Error('TEST 3 FAILED: Unverified user must receive 403 Forbidden with requiresVerification: true.');
  }
  console.log('✅ TEST 3 PASSED: Unverified login correctly rejected with 403.\n');

  console.log('[TEST 4] Testing Resend OTP Cooldown (60 seconds)...');
  const cooldownRes = await fetch(`${BASE_URL}/api/auth/resend-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });
  const cooldownData = await cooldownRes.json();
  console.log(`HTTP Status: ${cooldownRes.status}`, cooldownData);

  if (cooldownRes.status !== 429 || !cooldownData.cooldownActive) {
    throw new Error('TEST 4 FAILED: Expected 429 Too Many Requests due to cooldown.');
  }
  console.log('✅ TEST 4 PASSED: Resend cooldown enforced properly.\n');

  console.log('[TEST 5] Testing Bad OTP & Attempt Tracking...');
  const badOtpRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: '000000' }),
  });
  const badOtpData = await badOtpRes.json();
  console.log(`HTTP Status: ${badOtpRes.status}`, badOtpData);

  if (badOtpRes.status !== 400 || badOtpData.remainingAttempts !== 4) {
    throw new Error('TEST 5 FAILED: Expected 400 with 4 remaining attempts.');
  }
  console.log('✅ TEST 5 PASSED: Failed attempt detected and attempts decremented.\n');

  console.log('[TEST 6] Validating Correct OTP Verification...');
  // Find the generated OTP by testing 100000-999999 against the bcrypt hash in dbUser
  // Or in a direct verify test:
  // Let's find which OTP matches the dbUser.otp_hash:
  let matchingOtp = null;
  // Since randomInt is 6 digits, we can find it or set a known hash
  // Even easier, let's update MySQL with a known bcrypt hash of '849201' for this exact verification test!
  const knownOtp = '849201';
  const knownHash = await bcrypt.hash(knownOtp, 10);
  await pool.query('UPDATE users SET otp_hash = ?, otp_attempts = 1 WHERE email = ?', [knownHash, testEmail]);

  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: knownOtp }),
  });
  const verifyData = await verifyRes.json();
  console.log(`HTTP Status: ${verifyRes.status}`, verifyData);

  if (verifyRes.status !== 200 || !verifyData.token || !verifyData.user.isEmailVerified) {
    throw new Error('TEST 6 FAILED: Expected 200 with JWT token and isEmailVerified: true.');
  }
  console.log('✅ TEST 6 PASSED: OTP verified successfully and JWT session returned.\n');

  console.log('[TEST 7] Verifying User Can Now Sign In Successfully...');
  const verifiedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const verifiedLoginData = await verifiedLoginRes.json();
  console.log(`HTTP Status: ${verifiedLoginRes.status}`, verifiedLoginData);

  if (verifiedLoginRes.status !== 200 || !verifiedLoginData.token) {
    throw new Error('TEST 7 FAILED: Verified user must sign in successfully.');
  }
  console.log('✅ TEST 7 PASSED: Verified user logged in successfully!\n');

  console.log('[TEST 8] Verifying Existing Admin & Existing Users Unbroken...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@petpassport.internal',
      password: 'AdminSecurePass2026!',
    }),
  });
  const adminLoginData = await adminLoginRes.json();
  console.log(`Admin Login Status: ${adminLoginRes.status}`, adminLoginData.user?.email);

  if (adminLoginRes.status !== 200 || !adminLoginData.token) {
    throw new Error('TEST 8 FAILED: Admin login failed.');
  }
  console.log('✅ TEST 8 PASSED: Admin access is completely preserved!\n');

  console.log('[TEST 9] Duplicate Registration Rejection for Verified Email...');
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Duplicate Guy',
      email: testEmail,
      password: 'AnotherPassword!',
    }),
  });
  const dupData = await dupRes.json();
  console.log(`Duplicate Reg Status: ${dupRes.status}`, dupData);

  if (dupRes.status !== 409) {
    throw new Error('TEST 9 FAILED: Duplicate registration of verified account must return 409 Conflict.');
  }
  console.log('✅ TEST 9 PASSED: Duplicate registration cleanly rejected with 409 Conflict.\n');

  // Clean up test user
  await pool.query('DELETE FROM users WHERE email = ?', [testEmail]);
  await pool.end();

  console.log('🐾 ====================================================');
  console.log('🎉 ALL 9 EMAIL OTP VERIFICATION TESTS PASSED!');
  console.log('🐾 ====================================================\n');
}

runOtpTests().catch((err) => {
  console.error('❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
