const axios = require('axios');
const { sendEmail: sendConfiguredEmail } = require('../utils/sendEmail');
const { normalizePhone } = require('../utils/phone');

function isConfiguredValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/(^your_|example\.com|placeholder)/i.test(normalized);
}

function getReminderDeliveryConfiguration() {
  const emailRequirements = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const whatsAppRequirements = [
    'META_WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_PHONE_NUMBER_ID',
    'META_WHATSAPP_TEMPLATE_NAME',
    'META_GRAPH_API_VERSION',
  ];
  const emailMissingConfiguration = emailRequirements.filter((name) => !isConfiguredValue(process.env[name]));
  const whatsAppMissingConfiguration = whatsAppRequirements.filter((name) => !isConfiguredValue(process.env[name]));
  if (!/^\d+$/.test(String(process.env.META_WHATSAPP_PHONE_NUMBER_ID || '').trim())) {
    whatsAppMissingConfiguration.push('META_WHATSAPP_PHONE_NUMBER_ID');
  }
  if (!/^v\d+\.\d+$/.test(String(process.env.META_GRAPH_API_VERSION || '').trim())) {
    whatsAppMissingConfiguration.push('META_GRAPH_API_VERSION');
  }

  return {
    emailConfigured: emailMissingConfiguration.length === 0,
    emailMissingConfiguration,
    whatsAppConfigured: whatsAppMissingConfiguration.length === 0,
    whatsAppMissingConfiguration: [...new Set(whatsAppMissingConfiguration)],
  };
}

function formatMetaWhatsAppError(error) {
  const providerError = error.response?.data?.error;
  if (Number(providerError?.code) === 131030) {
    return 'This recipient is not on the Meta WhatsApp Cloud API allowed list. In Meta Developers > WhatsApp > API Setup, add and verify the recipient number, then retry. For live delivery, use a production WhatsApp sender and message an opted-in recipient.';
  }
  if (providerError?.message) {
    const code = providerError.code ? ` (${providerError.code})` : '';
    return `Meta WhatsApp API error${code}: ${providerError.message}`;
  }
  return `Meta WhatsApp API request failed: ${error.message}`;
}

/**
 * Send Email Notification
 */
const sendEmail = async ({ to, subject, html, text }) => {
  return sendConfiguredEmail({ to, subject, html, text });
};

/**
 * Send WhatsApp Notification
 */
const sendWhatsApp = async ({ phone, studentName, libraryName, amount, dueDate, paymentLink }) => {
  const { whatsAppConfigured, whatsAppMissingConfiguration } = getReminderDeliveryConfiguration();
  if (!whatsAppConfigured) {
    throw new Error(`Missing WhatsApp configuration: ${whatsAppMissingConfiguration.join(', ')}.`);
  }
  const formattedPhone = normalizePhone(phone);
  if (!formattedPhone) {
    throw new Error('Student phone number is not a valid WhatsApp number.');
  }

  const messageText = `Namaste ${studentName}! 🙏\nThis is a friendly reminder from *${libraryName}* regarding your library seat monthly fee.\n\n` +
    `*Pending Amount:* ₹${amount}\n` +
    `*Due Date:* ${dueDate}\n\n` +
    `Please clear your dues to ensure uninterrupted access to your seat.\n` +
    (paymentLink ? `Pay Online securely: ${paymentLink}\n\n` : '') +
    `Thank you,\nTeam ${libraryName}`;

  const graphApiVersion = process.env.META_GRAPH_API_VERSION.trim();
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID.trim();
  const endpoint = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;
  let response;
  try {
    response = await axios.post(endpoint, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone.slice(1),
      type: 'template',
      template: {
        name: process.env.META_WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.META_WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
        components: [{
          type: 'body',
          parameters: [studentName, libraryName, String(amount), dueDate, paymentLink]
            .map((text) => ({ type: 'text', text })),
        }],
      },
    }, {
      headers: {
        Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  } catch (error) {
    throw new Error(formatMetaWhatsAppError(error));
  }

  return {
    success: true,
    id: response.data.messages?.[0]?.id || '',
    channel: 'WHATSAPP',
    recipient: formattedPhone,
    message: messageText,
    simulated: false,
  };
};

module.exports = {
  formatMetaWhatsAppError,
  getReminderDeliveryConfiguration,
  sendEmail,
  sendWhatsApp,
};
