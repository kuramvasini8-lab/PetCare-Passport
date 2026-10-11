# 🐾 PetCare Passport

> **Calm, Beautiful Digital Identity, AI Healthcare & Lost-Pet Recovery Platform**  
> Built with Node.js, Express.js, MySQL, Nodemailer, and Google Gemini.

---

## 🌟 Overview

**PetCare Passport** is an empathetic, full-stack pet wellness and identification platform. It empowers pet owners to manage clinical records, track vaccination schedules, generate printable high-contrast QR digital passports, and coordinate emergency recovery if a pet goes missing.

The platform includes **Email OTP verification** during registration, an **AI veterinary note translator**, **real-time notifications**, and a dedicated **Administrator Portal** with strict role separation.

---

## 🎨 Visual Identity: Calm Golden Fur & Natural Cream

PetCare Passport is crafted with a serene, pet-friendly design system inspired by golden retriever coats, cream-colored cats, and soft sage leaves:

- **Primary Background**: `#FAF8F3` (Warm Ivory)
- **Secondary Background**: `#F5F0E7` (Natural Cream)
- **Cards & Surfaces**: `#FFFDF9` with delicate `#E8E0D2` borders and soft shadows
- **Golden Fur Accents**: `#D6B36A` & `#C9A45C`
- **Natural Sage Accents**: `#A6B49A` & `#6D7D62`
- **Typography**: Modern, legible [Inter](https://fonts.google.com/specimen/Inter) sans-serif
- **Card Corner Radii**: `12px` – `18px` rounded geometry

---

## 🚀 Key Features

### 1. 🔐 Email OTP Verification (Security & Anti-Abuse)
- **6-Digit Verification Code**: Cryptographically generated using `crypto.randomInt(100000, 1000000)` upon registration.
- **Secure MySQL Storage**: OTPs are hashed with `bcryptjs` before insertion. Plaintext OTPs are never stored in the database or exposed via API responses.
- **Pet-Friendly Verification Modal**: Segmented 6-digit input boxes with auto-advance, backspace handling, clipboard paste support, and real-time validation.
- **Expiry & Cooldown Protections**:
  - Code expiry set to **5 minutes** with a live countdown timer (`05:00` → `00:00`).
  - Resend cooldown set to **60 seconds** with live countdown (`Resend in 48s`).
  - Verification attempt limiter allowing a maximum of **5 attempts** per issued code.
- **Login Gating**: Unverified accounts are strictly blocked (`HTTP 403 Forbidden`) until email verification is complete.
- **Nodemailer SMTP Integration**: Compatible with Gmail App Passwords, SendGrid, Mailgun, Brevo, or any standard SMTP host, with an automatic development console simulator.

### 2. 🐶 Pet Owner Dashboard & Profiles (Full CRUD)
- **Personalized Metrics**: Real-time stats calculated directly from MySQL (Total Pets, Upcoming Vaccinations, Overdue Alerts, Lost Cases, Veterinary Visits).
- **Comprehensive Pet Records**: Name, species, breed, date of birth, gender, weight tracking, microchip, blood group, allergies, medical conditions, special care instructions, and emergency contacts.
- **Unpredictable Public Identifiers**: Generates secure alphanumeric codes (e.g. `PET-XXXX`) rather than sequential IDs.
- **One-Click Demo Data**: Populates realistic fictional pets (*Bruno the Labrador, Luna the British Shorthair, Milo the Corgi*) with sample health records, sightings, and notifications.

### 3. 💉 Digital Health Records & Smart Vaccination Tracker
- **5 Structured Categories**: Vaccinations, Veterinary Visits, Medications, Allergy records, and Weight measurements.
- **Smart Due-Date Calculation**:
  - `COMPLETED`: Administered and marked finished.
  - `UPCOMING`: Scheduled due date is within the next 7 days.
  - `OVERDUE`: Due date has passed and record is incomplete.
  - `SCHEDULED`: Due in more than 7 days.
  - `UNSCHEDULED`: No due date recorded.
- Completed vaccinations are never flagged as overdue.
- One-click "Mark as Administered" action automatically updates records and dashboard alerts.

### 4. 🪪 Digital Pet Passport & QR Emergency ID
- **High-Contrast Digital Passport**: Displays pet photo, unique ID, breed, owner-approved medical alerts, and black-and-white QR code for optical scanner reliability.
- **Printable Layout**: Clean browser print styling (`@media print`) that hides navigation and formats an official printable identification sheet.
- **Direct JPG Download**: One-click download of the pet's emergency QR code as a high-resolution print-ready JPEG (`>= 500px`).
- **Strict Emergency Privacy Filtering**: The public endpoint `/api/emergency/:publicCode` returns only owner-approved fields. Private owner objects, passwords, account details, and unapproved phone/email/medical notes are never exposed.

### 5. 🚨 Lost-Pet Recovery Center
- **Lost Pet Mode**: Allows owners to mark pets as `LOST` with last-seen location, timestamp, and distinguishing features.
- **Public Emergency Alert**: Anyone scanning the QR code sees an emergency missing alert banner and can submit a found-pet sighting report without creating an account.
- **Owner Review & Recovery**: Sighting reports appear directly in the owner's sighting inbox with location and finder notes. Marking a pet as `RECOVERED` immediately clears public emergency alerts.

### 6. 🤖 AI Healthcare Assistant & Clinical Explainer
- **Google Gemini & OpenRouter Engine**: Configured for Google Gemini (`gemini-3.8-flash` / `gemini-2.5-flash`) with OpenRouter fallback (`nvidia/nemotron-3.5-lightning:free`).
- **Pet Care Chat Assistant**: Educational Q&A tailored to your pet's species, age, weight, and medical history.
- **Veterinary Note Explainer**: Translates complex clinical records into plain language, medical glossary terms, explicit home instructions, follow-up dates, and questions for the next vet visit.
- **Veterinary Safety First**: Strict safety instructions prevent diagnosing or prescribing and provide immediate emergency guidance for critical red-flag symptoms.
- **Resilient Fallback**: If external AI services are unreachable, built-in structured educational guidance is seamlessly provided.

### 7. 🛡️ Administrator Portal (Strict Role Separation)
- **Role Enforcement**: Protected by backend JWT verification and role checking (`requireAdmin`). Ordinary owners cannot call `/api/admin/*`.
- **Platform Analytics**: Real database counts for registered users, active pets, lost cases, vaccinations, and recovery rates.
- **User Management**: Search, filter, inspect accounts, and apply administrative account suspension with recorded reasons.
- **Suspension Enforcement**: Suspended users are immediately blocked on the backend, even with active session tokens.
- **Report Moderation**: Moderate suspicious or flagged sighting reports.
- **Chronological Audit Logs**: Records all administrative actions (suspensions, reinstatements, and moderation).

### 8. 🔔 Notification System
- **Real-Time Polling**: Automatic background polling keeps in-app alerts updated.
- **Sighting & Health Alerts**: Delivers notifications for new community sightings, vaccination deadlines, and account status changes.
- **Flyout Center**: View, filter, and mark notifications as read individually or all at once.

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | HTML5, Vanilla CSS3 (Custom Design System Tokens), Vanilla JavaScript (Modular SPA Router), Lucide Icons, Canvas QR Generator |
| **Backend** | Node.js, Express.js (v5), RESTful JSON API |
| **Database** | MySQL (via `mysql2/promise` with Connection Pooling & Auto-Migrations) |
| **Authentication** | JWT (JSON Web Tokens), `bcryptjs` Password & OTP Hashing, Rate Limiting (`express-rate-limit`) |
| **Email Delivery** | Nodemailer with SMTP Transport (Gmail, SendGrid, Mailgun, etc.) & Dev Simulator |
| **AI Integration** | Google Gemini API (`@google/genai` / REST) & OpenRouter API |

---

## ⚙️ Environment Variables

Configure your `.env` file in the project root:

```env
PORT=3000
DB_DIALECT=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3366
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=petcare_passport

JWT_SECRET=your_super_secure_jwt_secret_key_here

# AI Configuration (Gemini or OpenRouter)
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash

OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free

# Admin Bootstrap Credentials (Used if no admin exists on first launch)
ADMIN_BOOTSTRAP_EMAIL=
ADMIN_BOOTSTRAP_PASSWORD=
ADMIN_BOOTSTRAP_NAME=System Administrator

NODE_ENV=development

# Email / SMTP Configuration for OTP Verification
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_character_app_password
SMTP_FROM="PetCare Passport" <your_email@gmail.com>
```

> [!TIP]
> **Gmail SMTP Setup**: If using Gmail, enable 2-Step Verification in your Google Account and generate an **App Password** under *Security → App passwords*. Use that 16-character App Password for `SMTP_PASS`.

---

## 🏁 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **MySQL**: v8.0 or higher running locally or remotely

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Database
Ensure MySQL is running. The server automatically creates the `petcare_passport` database and all required tables (`users`, `pets`, `health_records`, `found_reports`, `notifications`, `audit_logs`) on first startup.

### 4. Start the Application
```bash
npm start
```
The application will be live at: **http://localhost:3000**

---

## 🧪 Testing

The repository includes comprehensive automated test suites:

### Run Full End-to-End Test Suite (57 Tests)
```bash
node scripts/e2e-test.js
```
Validates the entire application flow across Tests A through K:
- Authentication & Email OTP verification
- Pet profile CRUD & unpredictable public ID generation
- Health records & 7-day vaccination status engine
- Emergency privacy filtering & high-contrast QR generation
- JPG download verification & optical QR decoding
- Community sighting submission & notification delivery
- AI health explainer & assistant fallback resilience
- Admin portal stats, account suspension & audit logs
- Role separation & cross-user access authorization

### Run Dedicated Email OTP Flow Tests (9 Tests)
```bash
node scripts/test-otp-flow.js
```
Validates the complete OTP security lifecycle:
- Unverified user registration & token withholding
- Bcrypt hash storage validation (no plaintext OTP in MySQL)
- Unverified login blocking (`HTTP 403`)
- 60-second resend cooldown enforcement (`HTTP 429`)
- Bad OTP detection & remaining attempt tracking
- Valid OTP verification & JWT issuance
- Post-verification login authorization
- Admin login preservation
- Duplicate registration rejection (`HTTP 409`)

---

## 🔑 Demo Access Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| **Administrator** | `admin@petpassport.internal` | `AdminSecurePass2026!` | Admin Portal & Owner Dashboard |
| **New Pet Owner** | Click **"New Owner Demo"** or register with your email | *(Your Password)* | Owner Dashboard & Pet Passports |

---

## 📁 Project Directory Structure

```
passport/
├── public/                     # Frontend SPA Client
│   ├── css/
│   │   └── style.css           # Design tokens, layouts, modal & print styles
│   ├── js/
│   │   └── app.js              # Client state, router, OTP controller, AI chat
│   └── index.html              # HTML structure, modals, notification flyout
├── src/                        # Backend Application
│   ├── config/
│   │   ├── db.js               # MySQL connection pool & table bootstrap
│   │   └── migrate.js          # Schema migration & column safety checks
│   ├── middleware/
│   │   ├── auth.js             # JWT authentication & admin authorization
│   │   └── rateLimiter.js      # Rate limiting against abuse
│   ├── models/
│   │   ├── sqlHelper.js        # SQL query builder & column mappers
│   │   ├── User.js             # User model with bcrypt & OTP handling
│   │   ├── Pet.js              # Pet model with privacy & lost details
│   │   ├── HealthRecord.js     # Health record & vaccination tracker model
│   │   ├── FoundReport.js      # Sighting report model
│   │   ├── Notification.js     # User notification stream model
│   │   └── AuditLog.js         # Administrative audit ledger model
│   ├── routes/
│   │   ├── auth.js             # Register, verify-otp, resend-otp, login, me
│   │   ├── pets.js             # Pet CRUD & emergency QR generation
│   │   ├── health.js           # Health records & vaccination tracker
│   │   ├── emergency.js        # Public emergency profile & sightings
│   │   ├── ai.js               # AI assistant & vet note explainer
│   │   ├── admin.js            # Admin stats, user suspension & audit logs
│   │   └── notifications.js    # Notification stream & mark-as-read
│   └── services/
│       ├── aiService.js        # Gemini & OpenRouter AI integration
│       ├── emailService.js     # Nodemailer SMTP & OTP email templates
│       ├── qrService.js        # High-contrast QR & JPG export
│       └── seedService.js      # Sample demo data generator
├── scripts/
│   ├── e2e-test.js             # Comprehensive 57-step E2E test runner
│   ├── test-otp-flow.js        # Dedicated 9-step OTP security test runner
│   └── test-smtp.js            # Standalone SMTP connection diagnostic tool
├── .env.example                # Template for environment variables
├── package.json                # Project dependencies and npm scripts
└── server.js                   # Application entry point & Express setup
```

---

## 📄 License

This project is licensed under the MIT License — free for educational, personal, and production use.
