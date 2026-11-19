const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getDelayUntilNextReminderScan,
  getLocalDateKey,
  isReminderDueToday,
} = require('../src/utils/reminderSchedule');

test('uses India local dates when calculating the pre-due reminder day', () => {
  const dueDate = new Date('2026-11-05T00:00:00.000Z');
  const reminderDay = new Date('2026-11-02T03:30:00.000Z');

  assert.equal(getLocalDateKey(dueDate), '2026-11-05');
  assert.equal(isReminderDueToday(dueDate, 3, reminderDay), true);
  assert.equal(isReminderDueToday(dueDate, 2, reminderDay), false);
});

test('schedules the next scan for 9 AM India time', () => {
  const beforeNine = new Date('2026-11-13T02:00:00.000Z');
  const atNine = new Date('2026-11-13T03:30:00.000Z');
  const afterNine = new Date('2026-11-13T04:00:00.000Z');

  assert.equal(getDelayUntilNextReminderScan(beforeNine), 90 * 60 * 1000);
  assert.equal(getDelayUntilNextReminderScan(atNine), 0);
  assert.equal(getDelayUntilNextReminderScan(afterNine), 23.5 * 60 * 60 * 1000);
});
