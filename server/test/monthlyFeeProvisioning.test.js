const assert = require('node:assert/strict');
const test = require('node:test');
const FeePayment = require('../src/models/FeePayment');
const Student = require('../src/models/Student');
const { ensureMonthlyFeeRecords } = require('../src/utils/monthlyFeeProvisioning');

test('creates a fee row for active students when the selected period is missing', async (context) => {
  const student = {
    _id: 'student-1',
    monthlyFee: 1200,
    monthlyFeeOverride: true,
    shift: 'Morning',
    slots: ['Morning'],
  };
  let update;

  context.mock.method(Student, 'find', async (filter) => {
    assert.deepEqual(filter, {
      libraryId: 'library-1',
      status: 'Active',
      joiningDate: { $lte: new Date(2026, 11, 0, 23, 59, 59, 999) },
    });
    return [student];
  });
  context.mock.method(FeePayment, 'updateOne', async (...args) => {
    update = args;
  });

  await ensureMonthlyFeeRecords(
    'library-1',
    { settings: { dueDayOfMonth: 7 } },
    11,
    2026
  );

  assert.deepEqual(update[0], {
    libraryId: 'library-1',
    studentId: 'student-1',
    month: 11,
    year: 2026,
  });
  assert.deepEqual(update[1].$setOnInsert, {
    ...update[0],
    amountDue: 1200,
    amountPaid: 0,
    balance: 1200,
    status: 'Due',
    dueDate: new Date(2026, 10, 7),
  });
  assert.deepEqual(update[2], { upsert: true, setDefaultsOnInsert: false });
});
