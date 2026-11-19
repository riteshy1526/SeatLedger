const assert = require('node:assert/strict');
const test = require('node:test');
const { buildSeatOccupancyUpdate } = require('../src/utils/studentSeatSync');

test('clears all assignment fields when the last active student leaves a seat', () => {
  assert.deepEqual(buildSeatOccupancyUpdate([], 'Occupied'), {
    status: 'Available',
    assignedStudentId: null,
    currentStudentName: '',
    currentShift: 'Full Day (24x7)',
    bookedSlots: [],
  });
});

test('preserves maintenance status while clearing student assignment data', () => {
  assert.deepEqual(buildSeatOccupancyUpdate([], 'Maintenance'), {
    status: 'Maintenance',
    assignedStudentId: null,
    currentStudentName: '',
    currentShift: 'Full Day (24x7)',
    bookedSlots: [],
  });
});

test('keeps a shared seat occupied only by its remaining active bookings', () => {
  const update = buildSeatOccupancyUpdate([
    {
      _id: 'student-2',
      studentName: 'Student Two',
      shift: 'Evening',
      slots: ['Evening'],
    },
  ], 'Occupied');

  assert.equal(update.status, 'Occupied');
  assert.equal(update.assignedStudentId, 'student-2');
  assert.deepEqual(update.bookedSlots, [{
    slot: 'Evening',
    studentId: 'student-2',
    studentName: 'Student Two',
  }]);
});
