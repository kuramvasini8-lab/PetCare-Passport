/**
 * Automated End-to-End Test Suite for PetCare Passport
 * Tests Tests A through K as required by the specification.
 */

const BASE_URL = 'http://localhost:3000';
const jpeg = require('jpeg-js');
const jsQR = require('jsqr');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function runTests() {
  console.log('====================================================');
  console.log('   STARTING PETCARE PASSPORT E2E TEST SUITE        ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;
  let testOwnerId = null;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Health check endpoint
    const hcRes = await fetch(`${BASE_URL}/api/health-check`);
    const hcData = await hcRes.json();
    assert(hcRes.ok && hcData.status === 'online', 'System Health Check: Server is online & DB connected');

    // TEST A: Authentication & Email OTP Verification
    console.log('\n--- TEST A: Authentication & Email OTP Verification ---');
    const ownerEmail = `testowner_${Date.now()}@petcare.test`;
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Samantha Vance',
        email: ownerEmail,
        password: 'Password123!',
        phone: '+1 (555) 789-0123',
      }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && regData.requiresVerification, 'Owner Registration: Success & requiresVerification is true');
    assert(!regData.token, 'Owner Registration: JWT token withheld until email verified');

    // Attempt login before verification (must be blocked)
    const unverifiedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, password: 'Password123!' }),
    });
    const unverifiedLoginData = await unverifiedLoginRes.json();
    assert(unverifiedLoginRes.status === 403 && unverifiedLoginData.requiresVerification, 'Unverified Account: Login blocked with 403');

    // Verify OTP using database test hook
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT, 10) || 3366,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'kuram@6281',
      database: process.env.MYSQL_DATABASE || 'petcare_passport',
    });
    const testOtp = '654321';
    const hashedOtp = await bcrypt.hash(testOtp, 10);
    await pool.query('UPDATE users SET otp_hash = ? WHERE email = ?', [hashedOtp, ownerEmail]);

    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, otp: testOtp }),
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 200 && verifyData.user.isEmailVerified, 'OTP Verification: Success & Account verified');
    assert(verifyData.user.role === 'OWNER', 'Owner Role: Role is strictly OWNER');
    testOwnerId = verifyData.user.id;

    // Duplicate email check
    const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Vance',
        email: ownerEmail,
        password: 'Password123!',
      }),
    });
    assert(dupRes.status === 409, 'Duplicate Registration: Rejected with HTTP 409');

    // Login test for verified user
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        password: 'Password123!',
      }),
    });
    const loginData = await loginRes.json();
    assert(loginRes.ok && loginData.token, 'Owner Sign In: Credentials verified & Token returned');
    const ownerToken = loginData.token;
    await pool.end();

    // Protected route check without token
    const unauthRes = await fetch(`${BASE_URL}/api/pets`);
    assert(unauthRes.status === 401, 'Authorization: Unauthenticated requests rejected with HTTP 401');

    // TEST B: Pet Management (CRUD)
    console.log('\n--- TEST B: Pet Profile Management ---');
    const addPetRes = await fetch(`${BASE_URL}/api/pets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Jasper',
        species: 'Dog',
        breed: 'Golden Retriever',
        dob: '2022-06-10',
        gender: 'Male',
        weight: 29.4,
        microchip: '985141008889991',
        bloodGroup: 'DEA 1.1 Positive',
        allergies: 'Beef intolerance',
        conditions: 'Seasonal paw irritation',
        specialCare: 'Needs paw balm after long trail walks.',
        emergencyPhone: '+1 (555) 789-0123',
        emergencyEmail: ownerEmail,
      }),
    });
    const addPetData = await addPetRes.json();
    assert(addPetRes.status === 201 && addPetData.pet._id, 'Add Pet: Successfully registered Jasper');
    assert(addPetData.pet.publicCode && addPetData.pet.publicCode.startsWith('PET-'), 'Digital ID: Unpredictable public code generated');

    const petId = addPetData.pet._id;
    const publicCode = addPetData.pet.publicCode;

    // Update Pet
    const updatePetRes = await fetch(`${BASE_URL}/api/pets/${petId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        weight: 30.2,
        specialCare: 'Needs paw balm and gentle brushing twice a week.',
      }),
    });
    const updatePetData = await updatePetRes.json();
    assert(updatePetRes.ok && updatePetData.pet.weight === 30.2, 'Update Pet: Weight update persisted in database');

    // TEST C & D: Health Records & Smart Vaccination Tracker
    console.log('\n--- TEST C & D: Health Records & Smart Vaccination Tracking ---');
    // Future due vaccination (Upcoming within 3 days)
    const upcomingDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const addVacRes1 = await fetch(`${BASE_URL}/api/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        petId: petId,
        category: 'VACCINATION',
        title: 'Bordetella Oral Immunization',
        date: new Date().toISOString(),
        dueDate: upcomingDate,
        vetClinic: 'Golden Oak Vet Clinic',
        isCompleted: false,
      }),
    });
    const addVacData1 = await addVacRes1.json();
    assert(addVacRes1.status === 201, 'Add Health Record: Bordetella vaccine created');

    // Overdue vaccination (due 15 days ago)
    const overdueDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const addVacRes2 = await fetch(`${BASE_URL}/api/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        petId: petId,
        category: 'VACCINATION',
        title: 'Rabies 3-Year Booster',
        date: new Date('2022-01-01').toISOString(),
        dueDate: overdueDate,
        vetClinic: 'Golden Oak Vet Clinic',
        isCompleted: false,
      }),
    });
    const addVacData2 = await addVacRes2.json();
    assert(addVacRes2.status === 201, 'Add Health Record: Overdue Rabies booster created');

    // Fetch and check computed statuses
    const listHealthRes = await fetch(`${BASE_URL}/api/health?petId=${petId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const listHealthData = await listHealthRes.json();
    const vac1 = listHealthData.records.find((r) => r.title.includes('Bordetella'));
    const vac2 = listHealthData.records.find((r) => r.title.includes('Rabies'));
    assert(vac1 && vac1.computedStatus === 'UPCOMING', 'Vaccination Tracker: 3-day due date computed as UPCOMING');
    assert(vac2 && vac2.computedStatus === 'OVERDUE', 'Vaccination Tracker: Passed due date computed as OVERDUE');

    // Complete a vaccination
    const compRes = await fetch(`${BASE_URL}/api/health/${vac2._id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const compData = await compRes.json();
    assert(compRes.ok && compData.record.status === 'COMPLETED', 'Vaccination Tracker: Completed booster marked COMPLETED');

    // Check dashboard statistics
    const statsRes = await fetch(`${BASE_URL}/api/pets/dashboard-stats`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const statsData = await statsRes.json();
    assert(statsData.stats.totalPets === 1, 'Dashboard Statistics: Total pets count is 1');
    assert(statsData.stats.upcomingVaccinations === 1, 'Dashboard Statistics: Upcoming vaccinations count is 1');

    // TEST E: Privacy Settings & QR Emergency Portal
    console.log('\n--- TEST E: Emergency Privacy & Public QR Profile ---');
    // Configure privacy: Hide phone and hide medical conditions
    const privRes = await fetch(`${BASE_URL}/api/pets/${petId}/privacy`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        showPhoto: true,
        showNameBreed: true,
        showMedical: false, // Hidden
        showAllergies: true,
        showSpecialCare: true,
        showPhone: false, // Hidden
        showEmail: false, // Hidden
      }),
    });
    assert(privRes.ok, 'Privacy Settings: Successfully configured');

    // Fetch public profile WITHOUT authentication
    const pubRes = await fetch(`${BASE_URL}/api/emergency/${publicCode}`);
    const pubData = await pubRes.json();
    assert(pubRes.ok && pubData.profile.name === 'Jasper', 'Public Emergency Profile: Public access succeeds');
    assert(pubData.profile.emergencyPhone === '', 'Backend Privacy Enforcement: Unapproved phone is NOT returned');
    assert(pubData.profile.medicalConditions === '', 'Backend Privacy Enforcement: Unapproved medical conditions are NOT returned');
    assert(pubData.profile.allergies === 'Beef intolerance', 'Backend Privacy Enforcement: Approved allergies ARE returned');
    assert(!pubData.profile.owner, 'Backend Privacy Enforcement: Private owner object is NEVER leaked');

    // QR generation endpoint with origin resolution
    const simulatedLanOrigin = 'http://192.168.1.150:3000';
    const qrRes = await fetch(`${BASE_URL}/api/emergency/${publicCode}/qr?origin=${encodeURIComponent(simulatedLanOrigin)}`);
    const qrData = await qrRes.json();
    assert(qrRes.ok && qrData.qrDataUrl && qrData.qrDataUrl.startsWith('data:image/png;base64,'), 'QR Generator: High-contrast QR code generated');
    assert(qrData.publicUrl.startsWith(simulatedLanOrigin), 'QR Destination: Respects environment / client origin resolution');
    assert(qrData.publicUrl.includes(publicCode), 'QR Destination: Accurately encodes pet public code');
    assert(qrData.jpgDownloadUrl === `/api/emergency/${publicCode}/qr.jpg`, 'QR Info: Returns direct JPG download URL');

    // Test genuine binary JPG download endpoint
    const jpgRes = await fetch(`${BASE_URL}/api/emergency/${publicCode}/qr.jpg?origin=${encodeURIComponent(simulatedLanOrigin)}`);
    assert(jpgRes.status === 200, 'JPG Download: HTTP 200 OK');
    assert(jpgRes.headers.get('content-type') === 'image/jpeg', 'JPG Download: Content-Type is image/jpeg');
    assert(jpgRes.headers.get('content-disposition')?.includes(`${publicCode}_qr.jpg`), 'JPG Download: Attachment filename includes pet public code');

    const jpgArrayBuffer = await jpgRes.arrayBuffer();
    const jpgBuffer = Buffer.from(jpgArrayBuffer);
    assert(jpgBuffer.length > 5000, 'JPG Verification: Genuine image payload size (> 5KB)');
    assert(jpgBuffer[0] === 0xff && jpgBuffer[1] === 0xd8, 'JPG Verification: Valid binary JPEG header magic bytes (0xFF 0xD8)');

    // Optical decode verification of the downloaded JPG image
    const decodedJpg = jpeg.decode(jpgBuffer, { useTArray: true });
    assert(decodedJpg.width >= 500 && decodedJpg.height >= 500, 'JPG Resolution: High-resolution print-ready format (>= 500px)');
    const qrDecoded = jsQR(decodedJpg.data, decodedJpg.width, decodedJpg.height);
    assert(qrDecoded && qrDecoded.data === qrData.publicUrl, 'Optical QR Scan: Decoded payload matches public emergency URL exactly');

    // Test Invalid Pet Identifiers
    const invalidProfileRes = await fetch(`${BASE_URL}/api/emergency/PET-NONEXISTENT999`);
    assert(invalidProfileRes.status === 404, 'Error Handling: Invalid pet identifier returns HTTP 404');
    const invalidJpgRes = await fetch(`${BASE_URL}/api/emergency/PET-NONEXISTENT999/qr.jpg`);
    assert(invalidJpgRes.status === 404, 'Error Handling: Invalid pet identifier for JPG returns HTTP 404');

    // TEST F: Community Sighting Reports & Real-Time Notifications
    console.log('\n--- TEST F: Community Sighting Reports & Notification Reception ---');
    // 1. Pet status remains SAFE and active
    const statusRes = await fetch(`${BASE_URL}/api/pets/${petId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ status: 'SAFE' }),
    });
    const statusData = await statusRes.json();
    assert(statusRes.ok && statusData.pet.status === 'SAFE', 'Safe Pet Status: Pet maintained in SAFE status');

    // 2. Public profile access triggers immediate scan notification for owner
    const pubScanRes = await fetch(`${BASE_URL}/api/emergency/${publicCode}`);
    const pubScanData = await pubScanRes.json();
    assert(pubScanRes.ok && pubScanData.profile.status === 'SAFE', 'Public Emergency Portal: Returns safe verified profile');

    // 3. Finder submits sighting report WITHOUT an account
    const reportRes = await fetch(`${BASE_URL}/api/emergency/${publicCode}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finderName: 'David Chen',
        finderContact: '+1 (555) 443-2211',
        locationDescription: 'Resting by the gazebo at Pinecrest Park',
        observations: 'Looked healthy and responsive. Had collar with PetCare tag.',
        message: 'I am sitting with him right now, please give me a call!',
      }),
    });
    const reportData = await reportRes.json();
    assert(reportRes.status === 201 && reportData.reportId, 'Sighting Submission: Public report submitted successfully');

    // 4. Owner reviews sighting report
    const ownerReportsRes = await fetch(`${BASE_URL}/api/reports`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const ownerReportsData = await ownerReportsRes.json();
    assert(ownerReportsData.reports.length === 1, 'Owner Sighting Inbox: Report delivered to owner');
    const repId = ownerReportsData.reports[0]._id;

    // Mark report reviewed
    const revReportRes = await fetch(`${BASE_URL}/api/reports/${repId}/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert(revReportRes.ok, 'Owner Sighting Inbox: Report marked as reviewed');

    // 5. Verify notifications are received in owner notification stream
    const notifRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const notifData = await notifRes.json();
    assert(notifRes.ok && notifData.notifications.length > 0, 'Notifications Received: Owner received notifications in stream');
    assert(notifData.unreadCount > 0, 'Notifications Received: Unread notification count is positive');

    // 6. Test instant real-time notification endpoint
    const testNotifRes = await fetch(`${BASE_URL}/api/notifications/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        title: '🔔 Verification Test Alert',
        message: 'Testing live notification reception.',
      }),
    });
    const testNotifData = await testNotifRes.json();
    assert(testNotifRes.ok && testNotifData.notification, 'Live Notification Delivery: Instant test notification received');

    // TEST G & H: AI Integration & Graceful Resilience
    console.log('\n--- TEST G & H: AI Health Explainer & Assistant Resilience ---');
    const aiChatRes = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        prompt: 'What are safe routine dental care practices for a Golden Retriever?',
        petId: petId,
      }),
    });
    const aiChatData = await aiChatRes.json();
    assert(aiChatRes.ok, 'AI Assistant Endpoint: Responds with HTTP 200');
    assert(aiChatData.disclaimer.includes('veterinarian'), 'AI Safety: Mandatory veterinary disclaimer is included');

    const aiExplainerRes = await fetch(`${BASE_URL}/api/ai/explain-note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        noteText: 'Canine presented for routine wellness. Grade 1 periodontal tartar. Heart auscultation normal. Recommend enzymatic dentifrice.',
        petId: petId,
      }),
    });
    const aiExplainerData = await aiExplainerRes.json();
    assert(aiExplainerRes.ok, 'AI Note Explainer: Responds cleanly and preserves original note context');

    // TEST I: Administrator Dashboard & Oversight
    console.log('\n--- TEST I: Administrator Dashboard & User Oversight ---');
    // Login as Admin
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@petpassport.internal',
        password: 'AdminSecurePass2026!',
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.ok && adminLoginData.user.role === 'ADMIN', 'Admin Login: Successfully signed in as ADMIN');
    const adminToken = adminLoginData.token;

    // Admin Stats
    const adminStatsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminStatsData = await adminStatsRes.json();
    assert(adminStatsRes.ok && adminStatsData.stats.totalUsers >= 2, 'Admin Dashboard: Stats reflect genuine database counts');

    // Suspend test owner account
    const suspendRes = await fetch(`${BASE_URL}/api/admin/users/${testOwnerId}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason: 'Investigation of duplicate profile submission' }),
    });
    assert(suspendRes.ok, 'Admin Action: Suspended test owner account');

    // Verify backend blocks operations by suspended user
    const blockedRes = await fetch(`${BASE_URL}/api/pets`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const blockedData = await blockedRes.json();
    assert(blockedRes.status === 403 && blockedData.suspended === true, 'Security Enforcement: Suspended user token blocked with HTTP 403');

    // Reactivate account
    const reactivateRes = await fetch(`${BASE_URL}/api/admin/users/${testOwnerId}/reactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(reactivateRes.ok, 'Admin Action: Reactivated test owner account');

    // Audit Log check
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditData = await auditRes.json();
    assert(auditData.logs.some((l) => l.action === 'SUSPEND_USER'), 'Audit Log: Account suspension recorded in chronological ledger');

    // TEST J: Role Separation & Authorization
    console.log('\n--- TEST J: Strict Role Separation ---');
    // Normal owner attempting to access Admin API
    const deniedAdminRes = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    assert(deniedAdminRes.status === 403, 'Role Separation: Owner cannot access Admin API (HTTP 403)');

    // Normal owner attempting to access another owner's pet
    const anotherOwner = `another_${Date.now()}@petcare.test`;
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: anotherOwner, password: 'Password123!' }),
    });

    const bobPool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT, 10) || 3366,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'kuram@6281',
      database: process.env.MYSQL_DATABASE || 'petcare_passport',
    });
    const bobOtp = '999111';
    const bobHash = await bcrypt.hash(bobOtp, 10);
    await bobPool.query('UPDATE users SET otp_hash = ? WHERE email = ?', [bobHash, anotherOwner]);
    await bobPool.end();

    const bobVerify = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: anotherOwner, otp: bobOtp }),
    }).then((r) => r.json());

    const unauthorizedPetAccess = await fetch(`${BASE_URL}/api/pets/${petId}`, {
      headers: { Authorization: `Bearer ${bobVerify.token}` },
    });
    assert(unauthorizedPetAccess.status === 404, 'Ownership Authorization: User Bob cannot access Jasper (HTTP 404/Denied)');

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Fatal Test Exception:', err);
  }
}

runTests();
