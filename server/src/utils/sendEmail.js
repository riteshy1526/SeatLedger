const nodemailer = require('nodemailer');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

let transporter;

function getTransporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    process.env.SMTP_HOST.includes('yourprovider.com') ||
    process.env.SMTP_USER.includes('example.com')
  ) {
    return null;
  }
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const cleanPass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '').replace(/["']/g, '');
    const isGmail =
      (process.env.SMTP_HOST || '').toLowerCase().includes('gmail') ||
      (process.env.SMTP_USER || '').toLowerCase().includes('@gmail.com');

    const config = isGmail
      ? {
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER.trim(),
            pass: cleanPass,
          },
        }
      : {
          host: process.env.SMTP_HOST.trim(),
          port,
          secure: process.env.SMTP_SECURE === 'true' || port === 465,
          auth: {
            user: process.env.SMTP_USER.trim(),
            pass: cleanPass,
          },
          tls: {
            rejectUnauthorized: false,
          },
        };

    transporter = nodemailer.createTransport(config);
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const mailTransporter = getTransporter();
  if (!mailTransporter) {
    if (process.env.NODE_ENV === 'production' && process.env.AUTH_OTP_LOG !== 'true') {
      throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured to send authentication email.');
    }
    return { success: true, id: `email_mock_${Date.now()}`, channel: 'EMAIL', simulated: true };
  }

  try {
    const info = await mailTransporter.sendMail({
      from: process.env.SMTP_FROM || `"SeatLedger" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return { success: true, id: info.messageId, channel: 'EMAIL', simulated: false };
  } catch (mailError) {
    console.error('[SMTP Mail Error]:', mailError.message);
    if (process.env.AUTH_OTP_LOG === 'true' || process.env.NODE_ENV !== 'production') {
      console.warn(`[SMTP Fallback] Mail send failed (${mailError.message}). Using dev OTP mode.`);
      return {
        success: true,
        id: `fallback_${Date.now()}`,
        channel: 'EMAIL',
        simulated: true,
        warning: mailError.message,
      };
    }
    throw mailError;
  }
}

module.exports = { sendEmail };
 