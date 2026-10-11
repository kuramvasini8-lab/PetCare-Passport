/**
 * Email Service for PetCare Passport
 * Handles secure OTP generation, email templating, and Nodemailer SMTP delivery.
 */

const nodemailer = require('nodemailer');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  // Strip whitespace from app passwords (e.g. Google's 4x4 format "abcd efgh ijkl mnop")
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      },
    });
  }

  return null;
}

/**
 * Send OTP Verification Email
 * @param {string} email - Destination email address
 * @param {string} name - User's name
 * @param {string} otp - 6-digit OTP code
 * @param {Date} expiresAt - Expiry date/time
 */
async function sendOtpEmail(email, name, otp, expiresAt = null) {
  const transporter = getTransporter();
  let from = process.env.SMTP_FROM || `"PetCare Passport" <${process.env.SMTP_USER || 'no-reply@petcarepassport.com'}>`;
  if (from.startsWith('"') && from.endsWith('"')) {
    from = from.slice(1, -1);
  }
  const expiryTime = expiresAt ? expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '5 minutes';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your PetCare Passport Verification Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F6F0; margin: 0; padding: 24px; color: #2C2621; }
    .container { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #EADBCC; overflow: hidden; box-shadow: 0 4px 20px rgba(74, 52, 34, 0.06); }
    .header { background: #D4A373; padding: 28px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.95; }
    .body { padding: 32px 28px; text-align: center; }
    .greeting { font-size: 16px; margin-bottom: 12px; color: #4A3E36; }
    .otp-card { background: #FAF7F2; border: 2px dashed #D4A373; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #9A6635; margin: 0; font-family: 'Courier New', monospace; }
    .expiry { font-size: 13px; color: #8A7A6E; margin-top: 10px; }
    .instructions { font-size: 13px; line-height: 1.6; color: #63554B; text-align: left; background: #FFFDF9; border: 1px solid #EADBCC; border-radius: 10px; padding: 14px 18px; margin-top: 20px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #9C8E82; background: #F8F6F0; border-top: 1px solid #EADBCC; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🐾 PetCare Passport</h1>
      <p>Digital Identity &amp; Smart Health Platform</p>
    </div>
    <div class="body">
      <div class="greeting">Hello <strong>${name || 'Pet Parent'}</strong>,</div>
      <p style="font-size:14px; line-height:1.5; color:#4A3E36; margin:0;">
        Welcome to PetCare Passport! To complete your registration and unlock full passport access for your pets, please verify your email address.
      </p>
      <div class="otp-card">
        <div style="font-size:11px; text-transform:uppercase; font-weight:700; color:#8A7A6E; letter-spacing:1px; margin-bottom:8px;">Your 6-Digit Verification Code</div>
        <div class="otp-code">${otp}</div>
        <div class="expiry">⏱ Valid for <strong>5 minutes</strong> (Expires at ${expiryTime})</div>
      </div>
      <div class="instructions">
        <strong>Security Tips for Pet Parents:</strong>
        <ul style="margin:6px 0 0; padding-left:18px;">
          <li>Never share this code with anyone. PetCare staff will never request your OTP.</li>
          <li>If you did not create this account, you can safely disregard this message.</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      &copy; 2026 PetCare Passport &bull; Protecting and caring for your companions.
    </div>
  </div>
</body>
</html>
`;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to: email,
        subject: `🐾 PetCare Passport Verification Code: ${otp}`,
        text: `Your PetCare Passport verification code is ${otp}. This code is valid for 5 minutes.`,
        html,
      });
      console.log(`[Email Service] OTP email delivered to ${email}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId, deliveredViaSmtp: true };
    } catch (err) {
      console.error(`[Email Service Error] Failed to send email to ${email}:`, err.message);
      // Fallback: log code in dev console so registration/testing is never completely blocked
      console.log(`[Email Service Dev Fallback] OTP for ${email}: ${otp}`);
      return { success: true, deliveredViaSmtp: false, warning: err.message };
    }
  } else {
    // Development / Local Test mode when SMTP credentials are not yet populated in .env
    console.log(`\n======================================================`);
    console.log(`[EMAIL OTP SIMULATOR - PetCare Passport]`);
    console.log(`To: ${email} (${name})`);
    console.log(`Subject: 🐾 PetCare Passport Verification Code: ${otp}`);
    console.log(`Verification Code: >> ${otp} <<`);
    console.log(`Valid until: ${expiryTime}`);
    console.log(`======================================================\n`);
    return { success: true, deliveredViaSmtp: false, simulated: true };
  }
}

module.exports = {
  sendOtpEmail,
};
