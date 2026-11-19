export function calculateSlotFee(slotFees, selectedSlots) {
  const feeBySlot = new Map((slotFees || []).map(({ slot, monthlyFee }) => [slot, Number(monthlyFee)]));
  const fullDaySlot = selectedSlots.find((slot) => /full\s*day/i.test(slot));
  const billableSlots = fullDaySlot ? [fullDaySlot] : selectedSlots;

  return billableSlots.reduce((total, slot) => total + (feeBySlot.get(slot) || 0), 0);
}

export function formatMonth(value) {
  if (!value) return '';
  const monthValue = typeof value === 'string' ? value.slice(0, 7) : value.toISOString().slice(0, 7);
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}
