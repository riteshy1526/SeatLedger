import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, IndianRupee, Save } from 'lucide-react';
import api from '../services/api';
import { formatMonth } from '../utils/slotPricing';

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthValue(date) {
  return typeof date === 'string' ? date.slice(0, 7) : date.toISOString().slice(0, 7);
}

export default function FeeSettings() {
  const [shifts, setShifts] = useState([]);
  const [slotFees, setSlotFees] = useState([]);
  const [fallbackSlotFees, setFallbackSlotFees] = useState([]);
  const [legacyMonthlyFee, setLegacyMonthlyFee] = useState(800);
  const [schedules, setSchedules] = useState([]);
  const [effectiveFrom, setEffectiveFrom] = useState(currentMonthValue);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await api.get('/library/pricing');
        setShifts(response.data.shifts || []);
        setSlotFees(response.data.activeSchedule?.slotFees || []);
        setLegacyMonthlyFee(response.data.defaultMonthlyFee || 800);
        setFallbackSlotFees((response.data.shifts || []).map((slot) => ({
          slot,
          monthlyFee: response.data.defaultMonthlyFee || 800,
        })));
        setSchedules(response.data.schedules || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load library fee settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchPricing();
  }, []);

  const handleEffectiveMonthChange = (value) => {
    setEffectiveFrom(value);
    const matchingSchedule = schedules.find(
      (schedule) => monthValue(schedule.effectiveFrom) === value
    );
    if (matchingSchedule) {
      setSlotFees(matchingSchedule.slotFees.map((entry) => ({
        slot: entry.slot,
        monthlyFee: entry.monthlyFee,
      })));
    } else {
      const activeSchedule = [...schedules]
        .filter((schedule) => monthValue(schedule.effectiveFrom) <= value)
        .sort((first, second) => new Date(second.effectiveFrom) - new Date(first.effectiveFrom))[0];
      setSlotFees(activeSchedule
        ? activeSchedule.slotFees.map((entry) => ({ slot: entry.slot, monthlyFee: entry.monthlyFee }))
        : shifts.map((slot) => ({
          slot,
          monthlyFee: fallbackSlotFees.find((entry) => entry.slot === slot)?.monthlyFee ?? legacyMonthlyFee,
        })));
    }
  };

  const updateSlotFee = (slot, value) => {
    setSlotFees((current) => current.map((entry) => (
      entry.slot === slot ? { ...entry, monthlyFee: value } : entry
    )));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.put('/library/pricing', { effectiveFrom, slotFees });
      setSchedules(response.data.schedules || []);
      setSlotFees(response.data.savedSchedule?.slotFees || slotFees);
      setSuccess(response.data.message || 'Slot fees saved.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save slot fees.');
    } finally {
      setSaving(false);
    }
  };

  const isHistoricalMonth = effectiveFrom < currentMonthValue();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-800">Slot Fee Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set a monthly rate for each slot. The same prices appear in the public library viewer.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="max-w-xs">
          <label htmlFor="fee-effective-month" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
            Rates effective from
          </label>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="fee-effective-month"
              type="month"
              required
              min="2026-01"
              max="2100-12"
              value={effectiveFrom}
              onChange={(event) => handleEffectiveMonthChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Select a month from 2026 through 2100. Past rates are view-only; future changes update student profiles and upcoming fee records when they take effect.
          </p>
        </div>

        {isHistoricalMonth && (
          <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
            Historical rates are view-only. Choose the current month or a future month to save a fee change.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="grid grid-cols-[1fr_150px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span>Library slot</span>
            <span>Monthly fee</span>
          </div>
          {shifts.map((slot) => {
            const entry = slotFees.find((fee) => fee.slot === slot);
            return (
              <div key={slot} className="grid grid-cols-[1fr_150px] items-center gap-3 border-t border-slate-100 px-4 py-3">
                <span className="text-sm font-semibold text-slate-700">{slot}</span>
                <label className="relative">
                  <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    readOnly={isHistoricalMonth}
                    aria-label={`${slot} monthly fee`}
                    value={entry?.monthlyFee ?? ''}
                    onChange={(event) => updateSlotFee(slot, event.target.value === '' ? '' : Number(event.target.value))}
                    className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              </div>
            );
          })}
        </div>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {success && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || isHistoricalMonth || slotFees.length !== shifts.length}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : `Save rates from ${formatMonth(effectiveFrom)}`}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <h3 className="font-bold text-slate-800">Scheduled fee changes</h3>
        {schedules.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No custom rates yet. Existing library rates remain in effect until you save a schedule.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {schedules.map((schedule) => (
              <div key={String(schedule._id || schedule.effectiveFrom)} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                <p className="text-sm font-semibold text-slate-700">{formatMonth(monthValue(schedule.effectiveFrom))}</p>
                <p className="text-xs text-slate-500">
                  {schedule.slotFees.map((fee) => `${fee.slot}: ₹${fee.monthlyFee}`).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
