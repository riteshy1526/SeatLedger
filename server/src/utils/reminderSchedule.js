const REMINDER_TIME_ZONE = 'Asia/Kolkata';

function getLocalDateKey(value, timeZone = REMINDER_TIME_ZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('A valid date is required to schedule a reminder.');
  }

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const parts = Object.fromEntries(dateParts.map(({ type, value: partValue }) => [type, partValue]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isReminderDueToday(dueDate, daysBeforeDue, now = new Date()) {
  const [year, month, day] = getLocalDateKey(dueDate).split('-').map(Number);
  const reminderDate = new Date(Date.UTC(year, month - 1, day - daysBeforeDue));
  return reminderDate.toISOString().slice(0, 10) === getLocalDateKey(now);
}

function getDelayUntilNextReminderScan(now = new Date()) {
  const [year, month, day] = getLocalDateKey(now).split('-').map(Number);
  const nextScan = Date.UTC(year, month - 1, day, 3, 30, 0, 0);
  const nextScanTime = nextScan >= now.getTime() ? nextScan : nextScan + 24 * 60 * 60 * 1000;
  return nextScanTime - now.getTime();
}

module.exports = {
  REMINDER_TIME_ZONE,
  getDelayUntilNextReminderScan,
  getLocalDateKey,
  isReminderDueToday,
};
