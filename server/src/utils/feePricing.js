function normalizeSlotFees(slotFees, fallbackSlots = [], fallbackFee = 800) {
  const validFees = Array.isArray(slotFees)
    ? slotFees.filter((entry) => entry && typeof entry.slot === 'string' && Number.isFinite(Number(entry.monthlyFee)))
    : [];

  if (!validFees.length && fallbackSlots.length) {
    return fallbackSlots.map((slot) => ({
      slot,
      monthlyFee: Number(fallbackFee) || 800,
    }));
  }

  return validFees.map((entry) => ({
    slot: entry.slot,
    monthlyFee: Number(entry.monthlyFee),
  }));
}

function getLatestFeeSchedule(library) {
  const schedules = (library.feeSchedules || [])
    .filter((schedule) => schedule && Array.isArray(schedule.slotFees) && schedule.slotFees.length > 0)
    .sort((first, second) => new Date(second.effectiveFrom || 0) - new Date(first.effectiveFrom || 0));

  if (schedules.length > 0) {
    return {
      effectiveFrom: schedules[0].effectiveFrom,
      slotFees: normalizeSlotFees(schedules[0].slotFees, library.shifts || [], library.defaultMonthlyFee),
    };
  }

  return {
    effectiveFrom: null,
    slotFees: normalizeSlotFees([], library.shifts || [], library.defaultMonthlyFee),
  };
}

function getActiveFeeSchedule(library, effectiveDate = new Date()) {
  const effectiveMonth = effectiveDate.getFullYear() * 12 + effectiveDate.getMonth();
  const schedules = (library.feeSchedules || [])
    .filter((schedule) => {
      if (!schedule || !schedule.effectiveFrom) return false;
      const start = new Date(schedule.effectiveFrom);
      return start.getUTCFullYear() * 12 + start.getUTCMonth() <= effectiveMonth;
    })
    .sort((first, second) => new Date(second.effectiveFrom) - new Date(first.effectiveFrom));

  if (schedules.length > 0) {
    return {
      effectiveFrom: schedules[0].effectiveFrom,
      slotFees: normalizeSlotFees(schedules[0].slotFees, library.shifts || [], library.defaultMonthlyFee),
    };
  }

  return {
    effectiveFrom: null,
    slotFees: normalizeSlotFees([], library.shifts || [], library.defaultMonthlyFee),
  };
}

function getUpcomingFeeSchedule(library, effectiveDate = new Date()) {
  const effectiveMonth = effectiveDate.getFullYear() * 12 + effectiveDate.getMonth();
  const schedules = (library.feeSchedules || [])
    .filter((schedule) => {
      if (!schedule || !schedule.effectiveFrom) return false;
      const start = new Date(schedule.effectiveFrom);
      return start.getUTCFullYear() * 12 + start.getUTCMonth() > effectiveMonth;
    })
    .sort((first, second) => new Date(first.effectiveFrom) - new Date(second.effectiveFrom));

  if (schedules.length === 0) return null;
  return {
    effectiveFrom: schedules[0].effectiveFrom,
    slotFees: normalizeSlotFees(schedules[0].slotFees, library.shifts || [], library.defaultMonthlyFee),
  };
}

function isScheduleEffective(effectiveFrom, date = new Date()) {
  const scheduleDate = new Date(effectiveFrom);
  const scheduleMonth = scheduleDate.getUTCFullYear() * 12 + scheduleDate.getUTCMonth();
  const currentMonth = date.getFullYear() * 12 + date.getMonth();
  return scheduleMonth <= currentMonth;
}

function calculateMonthlyFee(library, slots, effectiveDate = new Date()) {
  const selectedSlots = Array.isArray(slots) ? slots : [];
  const schedule = getActiveFeeSchedule(library, effectiveDate);
  const fees = new Map(schedule.slotFees.map((entry) => [entry.slot, Number(entry.monthlyFee)]));
  const fullDaySlot = selectedSlots.find((slot) => /full\s*day/i.test(slot));
  const billableSlots = fullDaySlot ? [fullDaySlot] : selectedSlots;

  return billableSlots.reduce((total, slot) => {
    const fee = fees.get(slot);
    return total + (Number.isFinite(fee) ? fee : Number(library.defaultMonthlyFee) || 800);
  }, 0);
}

function repriceFeeRecord(fee, amountDue) {
  const amountPaid = Number(fee.amountPaid) || 0;
  fee.amountDue = amountDue;
  fee.balance = Math.max(0, amountDue - amountPaid);
  fee.status = fee.balance === 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Due';
  return fee;
}

function resetFeePayment(fee, correctedAt = new Date()) {
  const previousPayment = `${fee.amountPaid} via ${fee.paymentMethod || 'None'}`;
  const correctionNote = `Payment reset to due by admin on ${correctedAt.toISOString()} (previous: ${previousPayment}).`;
  fee.notes = [fee.notes, correctionNote].filter(Boolean).join('\n');
  fee.amountPaid = 0;
  fee.balance = fee.amountDue;
  fee.status = 'Due';
  fee.paymentDate = null;
  fee.paymentMethod = 'None';
  return fee;
}

async function syncStudentMonthlyFee(student, library, effectiveDate = new Date()) {
  if (student.monthlyFeeOverride) return student.monthlyFee;
  const monthlyFee = calculateMonthlyFee(library, student.slots?.length ? student.slots : [student.shift], effectiveDate);
  if (student.monthlyFee !== monthlyFee) {
    student.monthlyFee = monthlyFee;
    await student.save();
  }
  return monthlyFee;
}

function toMonthStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month] = value.split('-').map(Number);
  if (year < 2026 || year > 2100 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

module.exports = {
  calculateMonthlyFee,
  getActiveFeeSchedule,
  getLatestFeeSchedule,
  getUpcomingFeeSchedule,
  isScheduleEffective,
  repriceFeeRecord,
  resetFeePayment,
  syncStudentMonthlyFee,
  toMonthStart,
};
