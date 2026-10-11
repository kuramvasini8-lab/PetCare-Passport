const User = require('../models/User');
const Pet = require('../models/Pet');
const HealthRecord = require('../models/HealthRecord');
const FoundReport = require('../models/FoundReport');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');

async function bootstrapAdmin() {
  try {
    const existingAdmin = await User.findOne({ role: 'ADMIN' });
    if (!existingAdmin) {
      const email = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@petpassport.internal';
      const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'AdminSecurePass2026!';
      const name = process.env.ADMIN_BOOTSTRAP_NAME || 'Platform Administrator';

      const admin = await User.create({
        name,
        email,
        password,
        role: 'ADMIN',
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
      });

      console.log(`[Admin Bootstrap] Initial administrator initialized: ${email}`);

      await AuditLog.create({
        admin: admin._id,
        adminEmail: email,
        action: 'SYSTEM_BOOTSTRAP',
        targetType: 'System',
        targetId: 'BOOTSTRAP',
        reason: 'Initial platform administrator setup via environment configuration',
      });
    }
  } catch (error) {
    console.error('[Admin Bootstrap Error]:', error.message);
  }
}

async function seedSampleData(ownerUser) {
  try {
    const count = await Pet.countDocuments({ owner: ownerUser._id });
    if (count > 0) {
      return { message: 'Owner already has registered pets. Skipping demo seed.' };
    }

    // Pet 1: Bruno the Golden Labrador (Status: SAFE)
    const bruno = await Pet.create({
      owner: ownerUser._id,
      name: 'Bruno',
      species: 'Dog',
      breed: 'Golden Labrador Retriever',
      dob: new Date('2021-04-15'),
      gender: 'Male',
      weight: 31.5,
      bloodGroup: 'DEA 1.1 Positive',
      photoUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80',
      microchip: '985141002345678',
      neutered: true,
      allergies: 'Chicken protein allergy (mild dermatological flare-ups)',
      conditions: 'Mild seasonal grass allergies',
      specialCare: 'Needs hypoallergenic salmon kibble; loves swimming but needs ear drying after water play.',
      emergencyPhone: '+1 (555) 019-2834',
      emergencyEmail: 'contact.bruno@petcarepassport.demo',
      status: 'SAFE',
      privacySettings: {
        showPhoto: true,
        showNameBreed: true,
        showMedical: true,
        showAllergies: true,
        showSpecialCare: true,
        showPhone: true,
        showEmail: false,
      },
    });

    // Health Records for Bruno
    await HealthRecord.create([
      {
        pet: bruno._id,
        owner: ownerUser._id,
        category: 'VACCINATION',
        title: 'Rabies 3-Year Vaccine (Fictional Sample)',
        date: new Date('2023-05-10'),
        dueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months in future (SCHEDULED)
        vetClinic: 'Golden Valley Veterinary Hospital',
        status: 'SCHEDULED',
        isCompleted: false,
        notes: 'Three-year adjuvant-free rabies booster. Administered in right hind flank.',
      },
      {
        pet: bruno._id,
        owner: ownerUser._id,
        category: 'VACCINATION',
        title: 'Bordetella (Kennel Cough) Oral (Fictional Sample)',
        date: new Date('2023-11-01'),
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days in future (UPCOMING)
        vetClinic: 'Golden Valley Veterinary Hospital',
        status: 'UPCOMING',
        isCompleted: false,
        notes: 'Annual mucosal immunization for kennel boarding.',
      },
      {
        pet: bruno._id,
        owner: ownerUser._id,
        category: 'VACCINATION',
        title: 'DHPP Core Booster (Fictional Sample)',
        date: new Date('2022-09-01'),
        dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago (OVERDUE)
        vetClinic: 'Sunset Companion Clinic',
        status: 'OVERDUE',
        isCompleted: false,
        notes: 'Distemper, Hepatitis, Parvovirus, Parainfluenza annual booster.',
      },
      {
        pet: bruno._id,
        owner: ownerUser._id,
        category: 'VET_VISIT',
        title: 'Annual Comprehensive Physical Exam (Fictional Sample)',
        date: new Date('2024-03-12'),
        vetClinic: 'Golden Valley Veterinary Hospital - Dr. Sarah Jenkins',
        notes: 'Normal heart & lungs auscultation. Sound gait, teeth grade 1 tartar. Advised dental chews and continued salmon diet.',
      },
      {
        pet: bruno._id,
        owner: ownerUser._id,
        category: 'WEIGHT',
        title: 'Spring Routine Weight Check (Fictional Sample)',
        date: new Date('2024-03-12'),
        weightValue: 31.5,
        vetClinic: 'Golden Valley Veterinary Hospital',
        notes: 'Ideal body condition score (BCS 5/9).',
      },
    ]);

    // Pet 2: Luna the Cream British Shorthair (Status: LOST to demonstrate Lost Center & Sighting report)
    const luna = await Pet.create({
      owner: ownerUser._id,
      name: 'Luna',
      species: 'Cat',
      breed: 'British Shorthair (Cream)',
      dob: new Date('2022-08-20'),
      gender: 'Female',
      weight: 4.2,
      bloodGroup: 'Type A',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80',
      microchip: '985141009988776',
      neutered: true,
      allergies: 'Sensitive digestive tract; strictly grain-free diet.',
      conditions: 'Indoor-only cat; timid around loud traffic.',
      specialCare: 'Carries a silver bell on a breakaway collar. May hide in garden sheds or under porches.',
      emergencyPhone: '+1 (555) 019-2834',
      emergencyEmail: 'owner@petcarepassport.demo',
      status: 'SAFE',
      lostDetails: {
        lastSeenLocation: 'Oakridge Residential Green, near Northway Park gate',
        lastSeenDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        circumstances: 'Slipped out through the garden patio door during a grocery delivery. Friendly but easily startled.',
      },
      privacySettings: {
        showPhoto: true,
        showNameBreed: true,
        showMedical: true,
        showAllergies: true,
        showSpecialCare: true,
        showPhone: true,
        showEmail: true,
      },
    });

    // Sighting report for Luna
    await FoundReport.create({
      pet: luna._id,
      publicCode: luna.publicCode,
      finderName: 'Clara Miller',
      finderContact: '+1 (555) 321-9988',
      locationDescription: 'Backyard gazebo at 14 Maple Terrace (2 blocks from Northway Park)',
      sightingDate: new Date(Date.now() - 4 * 60 * 60 * 1000),
      observations: 'Cream cat with round face and silver bell collar resting under patio steps. Looked clean and safe.',
      message: 'I put out a small bowl of fresh water. She let me approach to read the passport collar tag. Please call me whenever you can!',
      status: 'PENDING',
    });

    // Pet 3: Milo the Friendly Mixed-breed (Status: SAFE)
    const milo = await Pet.create({
      owner: ownerUser._id,
      name: 'Milo',
      species: 'Dog',
      breed: 'Corgi / Aussie Mix',
      dob: new Date('2023-01-10'),
      gender: 'Male',
      weight: 12.8,
      bloodGroup: 'Unknown',
      photoUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
      microchip: '985141005544332',
      neutered: true,
      allergies: 'None recorded',
      conditions: 'Active agility companion',
      specialCare: 'Needs daily joint supplement chew with breakfast.',
      emergencyPhone: '+1 (555) 019-2834',
      emergencyEmail: '',
      status: 'SAFE',
      privacySettings: {
        showPhoto: true,
        showNameBreed: true,
        showMedical: false,
        showAllergies: true,
        showSpecialCare: true,
        showPhone: true,
        showEmail: false,
      },
    });

    // Notifications for owner
    await Notification.create([
      {
        user: ownerUser._id,
        title: 'New Sighting Report for Luna',
        message: 'A finder submitted a sighting report near Maple Terrace. Check the Lost Pet Center for details.',
        type: 'alert',
        link: '#lost-center',
      },
      {
        user: ownerUser._id,
        title: 'Upcoming Vaccination Due',
        message: 'Bruno is due for Bordetella oral immunization within 3 days.',
        type: 'warning',
        link: '#health',
      },
      {
        user: ownerUser._id,
        title: 'Overdue Vaccination Alert',
        message: 'Bruno has an overdue DHPP booster. Contact your vet clinic to reschedule.',
        type: 'alert',
        link: '#health',
      },
    ]);

    console.log('[Seed Service] Sample demo pets (Bruno, Luna, Milo) created successfully.');
    return { success: true, count: 3 };
  } catch (err) {
    console.error('[Seed Service Error]:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  bootstrapAdmin,
  seedSampleData,
};
