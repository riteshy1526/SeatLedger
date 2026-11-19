const assert = require('node:assert/strict');
const test = require('node:test');
const {
  formatMetaWhatsAppError,
  getReminderDeliveryConfiguration,
  sendWhatsApp,
} = require('../src/services/notification.service');

const whatsAppSettings = [
  'META_WHATSAPP_ACCESS_TOKEN',
  'META_WHATSAPP_PHONE_NUMBER_ID',
  'META_WHATSAPP_TEMPLATE_NAME',
  'META_GRAPH_API_VERSION',
];

test('reports missing Meta settings and prevents an unconfigured WhatsApp send', async () => {
  const previousValues = new Map(whatsAppSettings.map((name) => [name, process.env[name]]));
  try {
    whatsAppSettings.forEach((name) => delete process.env[name]);

    const configuration = getReminderDeliveryConfiguration();
    assert.equal(configuration.whatsAppConfigured, false);
    assert.deepEqual(configuration.whatsAppMissingConfiguration, whatsAppSettings);
    await assert.rejects(
      sendWhatsApp({ phone: '9876543210' }),
      /Missing WhatsApp configuration: META_WHATSAPP_ACCESS_TOKEN/
    );
  } finally {
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('rejects a Graph API version that would produce a malformed endpoint path', () => {
  const settings = {
    META_WHATSAPP_ACCESS_TOKEN: 'test-token',
    META_WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    META_WHATSAPP_TEMPLATE_NAME: 'approved_template',
    META_GRAPH_API_VERSION: 'META_GRAPH_API_VERSION=v27.0',
  };
  const previousValues = new Map(Object.keys(settings).map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, settings);

    const configuration = getReminderDeliveryConfiguration();
    assert.equal(configuration.whatsAppConfigured, false);
    assert.deepEqual(configuration.whatsAppMissingConfiguration, ['META_GRAPH_API_VERSION']);
  } finally {
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('explains how to resolve a Meta test-recipient allowlist rejection', () => {
  const message = formatMetaWhatsAppError({
    response: { data: { error: { code: 131030, message: 'Recipient phone number not in allowed list' } } },
  });

  assert.match(message, /Meta Developers > WhatsApp > API Setup/);
  assert.match(message, /add and verify the recipient number/);
});
