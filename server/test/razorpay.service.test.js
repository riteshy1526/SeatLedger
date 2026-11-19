const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildRouteTransfer,
  getRouteReferenceId,
  validateRouteLinkedAccount,
} = require('../src/services/razorpay.service');

test('builds a full-amount INR transfer for the library linked account', () => {
  const transfer = buildRouteTransfer({
    accountId: 'acc_library123',
    amountPaise: 125050,
    feeId: 'fee_123',
    libraryName: 'Kashi Study Point',
    monthYear: '11/2026',
  });

  assert.equal(transfer.account, 'acc_library123');
  assert.equal(transfer.amount, 125050);
  assert.equal(transfer.currency, 'INR');
  assert.equal(transfer.on_hold, false);
  assert.deepEqual(transfer.notes, {
    feeId: 'fee_123',
    libraryName: 'Kashi Study Point',
    monthYear: '11/2026',
  });
});

test('uses a stable library-specific Route reference ID', () => {
  assert.equal(getRouteReferenceId('library123'), 'seatledger_library123');
});

test('rejects a linked account registered to another library', () => {
  assert.throws(
    () => validateRouteLinkedAccount({
      reference_id: 'seatledger_library456',
      type: 'route',
      status: 'activated',
      activated_at: 1,
      created_at: 1,
    }, 'seatledger_library123'),
    /not registered to this library/
  );
});
