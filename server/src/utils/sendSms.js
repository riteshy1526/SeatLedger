const axios = require('axios');
const { normalizePhone } = require('./phone');

const MSG91_FLOW_API_URL = 'https://control.msg91.com/api/v5/flow/';

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `******${digits.slice(-4)}` : 'the linked account mobile';
}

function buildMsg91Payload({ templateId, phone, code }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error('A valid Razorpay Linked Account mobile number is required.');
  }
  if (!/^\d{6}$/.test(String(code || ''))) {
    throw new Error('The SMS verification code must contain 6 digits.');
  }
  if (!templateId) {
    throw new Error('MSG91_TEMPLATE_ID must be configured to send SMS verification codes.');
  }

  return {
    template_id: templateId,
    short_url: '0',
    recipients: [
      {
        mobiles: normalizedPhone.slice(1),
        var1: String(code),
      },
    ],
  };
}

async function sendOtpSms({ phone, code }) {
  const authKey = String(process.env.MSG91_AUTH_KEY || '').trim();
  const templateId = String(process.env.MSG91_TEMPLATE_ID || '').trim();

  if (!authKey || !templateId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Configure MSG91_AUTH_KEY and MSG91_TEMPLATE_ID to send SMS verification codes.');
    }
    return { success: true, simulated: true };
  }

  const payload = buildMsg91Payload({ templateId, phone, code });
  try {
    const response = await axios.post(MSG91_FLOW_API_URL, payload, {
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (String(response.data?.type || '').toLowerCase() !== 'success') {
      throw new Error(response.data?.message || 'MSG91 did not confirm the SMS request.');
    }
    return { success: true, response: response.data };
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    throw new Error(`MSG91 could not send the verification SMS: ${message}`);
  }
}

module.exports = { buildMsg91Payload, maskPhone, sendOtpSms };
