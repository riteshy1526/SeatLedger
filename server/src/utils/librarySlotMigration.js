const Library = require('../models/Library');
const Student = require('../models/Student');
const Seat = require('../models/Seat');

const LEGACY_EVENING_SLOT = 'Evening (06:00 PM - 11:00 PM)';
const EVENING_SLOT = 'Evening (06:00 PM - 12:00 AM)';
const NIGHT_SLOT = 'Night Shift (12:00 AM - 06:00 AM)';
const SLOT_ORDER = new Map([
  ['Morning (06:00 AM - 12:00 PM)', 0],
  ['Afternoon (12:00 PM - 06:00 PM)', 1],
  [EVENING_SLOT, 2],
  [NIGHT_SLOT, 3],
  ['Full Day (24x7)', 4],
]);

function orderSlots(slots) {
  return slots
    .map((slot, index) => ({ slot, index }))
    .sort((first, second) => (
      (SLOT_ORDER.get(typeof first.slot === 'string' ? first.slot : first.slot.slot) ?? 3.5)
        - (SLOT_ORDER.get(typeof second.slot === 'string' ? second.slot : second.slot.slot) ?? 3.5)
      || first.index - second.index
    ))
    .map(({ slot }) => slot);
}

async function migrateLibrarySlots() {
  const libraries = await Library.find();

  for (const library of libraries) {
    let changed = false;
    const shifts = [...(library.shifts || [])];
    const updatedShifts = shifts.map((slot) => (
      slot === LEGACY_EVENING_SLOT ? EVENING_SLOT : slot
    ));
    if (!updatedShifts.includes(NIGHT_SLOT)) updatedShifts.push(NIGHT_SLOT);
    const orderedShifts = orderSlots(updatedShifts);
    if (orderedShifts.some((slot, index) => slot !== shifts[index]) || orderedShifts.length !== shifts.length) {
      library.shifts = orderedShifts;
      changed = true;
    }

    for (const schedule of library.feeSchedules || []) {
      if (!Array.isArray(schedule.slotFees) || schedule.slotFees.some((fee) => !fee || !fee.slot)) {
        schedule.slotFees = (library.shifts || []).map((slot) => ({
          slot,
          monthlyFee: Number(library.defaultMonthlyFee) || 800,
        }));
        changed = true;
        continue;
      }

      const existingNightRate = schedule.slotFees.find((fee) => fee.slot === NIGHT_SLOT);
      for (const fee of schedule.slotFees) {
        if (fee && fee.slot === LEGACY_EVENING_SLOT) {
          fee.slot = EVENING_SLOT;
          changed = true;
        }
      }
      if (!existingNightRate) {
        schedule.slotFees.push({
          slot: NIGHT_SLOT,
          monthlyFee: Number(library.defaultMonthlyFee) || 800,
        });
        changed = true;
      }
      const orderedFees = orderSlots(schedule.slotFees);
      if (orderedFees.some((fee, index) => fee.slot !== schedule.slotFees[index].slot)) {
        schedule.slotFees = orderedFees;
        changed = true;
      }
    }

    if (changed) await library.save();

    const students = await Student.find({
      libraryId: library._id,
      $or: [{ shift: LEGACY_EVENING_SLOT }, { slots: LEGACY_EVENING_SLOT }],
    });
    for (const student of students) {
      if (student.shift === LEGACY_EVENING_SLOT) student.shift = EVENING_SLOT;
      student.slots = (student.slots || []).map((slot) => (
        slot === LEGACY_EVENING_SLOT ? EVENING_SLOT : slot
      ));
      await student.save();
    }

    const seats = await Seat.find({
      libraryId: library._id,
      $or: [
        { currentShift: LEGACY_EVENING_SLOT },
        { 'bookedSlots.slot': LEGACY_EVENING_SLOT },
      ],
    });
    for (const seat of seats) {
      if (seat.currentShift === LEGACY_EVENING_SLOT) seat.currentShift = EVENING_SLOT;
      for (const booking of seat.bookedSlots || []) {
        if (booking.slot === LEGACY_EVENING_SLOT) booking.slot = EVENING_SLOT;
      }
      await seat.save();
    }
  }
}

module.exports = { migrateLibrarySlots };
