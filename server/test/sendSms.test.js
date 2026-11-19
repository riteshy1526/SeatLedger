const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const { buildMsg91Payload, maskPhone, sendOtpSms } = require('../src/utils/sendSms');

test('builds a MSG91 flow payload with a country-code mobile and the OTP variable', () => {
  assert.deepEqual(buildMsg91Payload({
    templateId: 'approved-template',
    phone: '+91 98765 43210',
    code: '001234',
  }), {
    template_id: 'approved-template',
    short_url: '0',
    recipients: [{ mobiles: '919876543210', var1: '001234' }],
  });
  assert.equal(maskPhone('+91 98765 43210'), '******3210');
});

test('rejects invalid numbers and codes before calling MSG91', () => {
  assert.throws(
    () => buildMsg91Payload({ templateId: 'approved-template', phone: 'not-a-number', code: '123456' }),
    /valid Razorpay Linked Account mobile number/
  );
  assert.throws(
    () => buildMsg91Payload({ templateId: 'approved-template', phone: '+919876543210', code: '12345' }),
    /6 digits/
  );
});

test('sends OTP through MSG91 with the configured auth key and template', async () => {
  const originalPost = axios.post;
  const originalAuthKey = process.env.MSG91_AUTH_KEY;
  const originalTemplateId = process.env.MSG91_TEMPLATE_ID;
  let request;

  process.env.MSG91_AUTH_KEY = 'test-auth-key';
  process.env.MSG91_TEMPLATE_ID = 'test-template';
  axios.post = async (...args) => {
    request = args;
    return { data: { type: 'success' } };
  };

  try {
    await sendOtpSms({ phone: '+919876543210', code: '123456' });
    assert.equal(request[0], 'https://control.msg91.com/api/v5/flow/');
    assert.deepEqual(request[1].recipients, [{ mobiles: '919876543210', var1: '123456' }]);
    assert.equal(request[2].headers.authkey, 'test-auth-key');
  } finally {
    axios.post = originalPost;
    if (originalAuthKey === undefined) delete process.env.MSG91_AUTH_KEY;
    else process.env.MSG91_AUTH_KEY = originalAuthKey;
    if (originalTemplateId === undefined) delete process.env.MSG91_TEMPLATE_ID;
    else process.env.MSG91_TEMPLATE_ID = originalTemplateId;
  }
});

test('surfaces MSG91 template failures instead of reporting SMS success', async () => {
  const originalPost = axios.post;
  const originalAuthKey = process.env.MSG91_AUTH_KEY;
  const originalTemplateId = process.env.MSG91_TEMPLATE_ID;

  process.env.MSG91_AUTH_KEY = 'test-auth-key';
  process.env.MSG91_TEMPLATE_ID = 'test-template';
  axios.post = async () => ({ data: { type: 'error', message: 'Template is not approved.' } });

  try {
    await assert.rejects(
      sendOtpSms({ phone: '+919876543210', code: '123456' }),
      /Template is not approved/
    );
  } finally {
    axios.post = originalPost;
    if (originalAuthKey === undefined) delete process.env.MSG91_AUTH_KEY;
    else process.env.MSG91_AUTH_KEY = originalAuthKey;
    if (originalTemplateId === undefined) delete process.env.MSG91_TEMPLATE_ID;
    else process.env.MSG91_TEMPLATE_ID = originalTemplateId;
  }
});
