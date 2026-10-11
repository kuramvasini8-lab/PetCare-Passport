require('dotenv').config();
const nodemailer = require('nodemailer');

async function testSend() {
  const passClean = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: passClean,
    },
  });

  const from = process.env.SMTP_FROM || `"PetCare Passport" <${process.env.SMTP_USER}>`;

  console.log('Sending test email from:', from, 'to:', process.env.SMTP_USER);

  try {
    const info = await transporter.sendMail({
      from,
      to: process.env.SMTP_USER,
      subject: '🐾 PetCare Passport SMTP Test',
      text: 'This is a test verification email from PetCare Passport.',
    });
    console.log('SendMail SUCCEEDED! Message ID:', info.messageId);
  } catch (err) {
    console.error('SendMail FAILED:', err.message);
  }
}

testSend();
