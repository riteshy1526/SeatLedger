const assert = require('node:assert/strict');
const test = require('node:test');
const { repriceFeeRecord, resetFeePayment } = require('../src/utils/feePricing');

test('reprices a partial fee while preserving the collected amount', () => {
  const fee = { amountDue: 1000, amountPaid: 300, balance: 700, status: 'Partial' };

  repriceFeeRecord(fee, 1200);

  assert.deepEqual(fee, {
    amountDue: 1200,
    amountPaid: 300,
    balance: 900,
    status: 'Partial',
  });
});

test('marks the bill paid when collected amount covers the revised fee', () => {
  const fee = { amountDue: 1000, amountPaid: 1000, balance: 0, status: 'Paid' };

  repriceFeeRecord(fee, 800);

  assert.equal(fee.balance, 0);
  assert.equal(fee.status, 'Paid');
});

test('resets a manual payment to due and records the correction', () => {
  const fee = {
    amountDue: 1000,
    amountPaid: 1000,
    balance: 0,
    status: 'Paid',
    paymentMethod: 'Cash',
    paymentDate: new Date('2026-11-05T00:00:00.000Z'),
    notes: 'Counter receipt 42',
  };

  resetFeePayment(fee, new Date('2026-11-13T00:00:00.000Z'));

  assert.equal(fee.amountPaid, 0);
  assert.equal(fee.balance, 1000);
  assert.equal(fee.status, 'Due');
  assert.equal(fee.paymentMethod, 'None');
  assert.equal(fee.paymentDate, null);
  assert.match(fee.notes, /Counter receipt 42/);
  assert.match(fee.notes, /Payment reset to due by admin/);
});
