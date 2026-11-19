import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { Armchair, CheckCircle2, AlertCircle, Plus, RefreshCw, Trash2, User } from 'lucide-react';
import { formatSeatNumber, sortSeatsByNumber } from '../utils/seatNumber';
import { useAuth } from '../context/AuthContext';

export default function SeatMatrix() {
  const { isAdmin } = useAuth();
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchSeats();
  }, []);

  const fetchSeats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/seats');
      if (res.data.success) {
        setSeats(res.data.seats);
        setLoadError('');
      } else {
        setLoadError('The server could not load the seat matrix. Please try again.');
      }
    } catch (err) {
      console.error('Failed to fetch seats:', err);
      setLoadError(err.response?.data?.message || 'Could not load the seat matrix. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSeatClick = (seat) => {
    setSelectedSeat(seat);
    setModalOpen(true);
  };

  const updateSeatStatus = async (newStatus) => {
    if (!selectedSeat) return;
    setUpdating(true);
    setActionError('');
    setActionMessage('');
    try {
      await api.put(`/seats/${selectedSeat.seatNumber}/status`, { status: newStatus });
      await fetchSeats();
      setModalOpen(false);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to update seat status.');
    } finally {
      setUpdating(false);
    }
  };

  const addSeat = async () => {
    setUpdating(true);
    setActionError('');
    setActionMessage('');
    try {
      const response = await api.post('/seats');
      setActionMessage(response.data.message || 'Seat added.');
      await fetchSeats();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to add a seat.');
    } finally {
      setUpdating(false);
    }
  };

  const removeSelectedSeat = async () => {
    if (!selectedSeat || selectedSeat.status === 'Occupied') return;
    const seatNumber = selectedSeat.seatNumber;
    const confirmed = window.confirm(
      `Remove seat ${seatNumber}? All later seat numbers and student assignments will shift down one number. Inactive students assigned to this seat will be changed to Pending Allocation.`
    );
    if (!confirmed) return;

    setUpdating(true);
    setActionError('');
    setActionMessage('');
    try {
      const response = await api.delete(`/seats/${encodeURIComponent(seatNumber)}`);
      setModalOpen(false);
      setSelectedSeat(null);
      setActionMessage(response.data.message || `Seat ${seatNumber} removed.`);
      await fetchSeats();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to remove this seat.');
    } finally {
      setUpdating(false);
    }
  };

  const occupiedCount = seats.filter((s) => s.status === 'Occupied').length;
  const availableCount = seats.filter((s) => s.status === 'Available').length;
  const maintenanceCount = seats.filter((s) => s.status === 'Maintenance').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Interactive Seat Matrix</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time library floor layout, slot occupancies, and quick maintenance controls
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={addSeat}
              disabled={updating || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Seat
            </button>
          )}
          <button
            onClick={fetchSeats}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Layout
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {actionMessage}
        </p>
      )}
      {loadError && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </p>
      )}

      {/* Legend & Summary */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500"></span>
            <span>Available ({availableCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-rose-600"></span>
            <span>Occupied ({occupiedCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-amber-500"></span>
            <span>Maintenance ({maintenanceCount})</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Total seats: {seats.length}. Click any seat to inspect or alter status
          {isAdmin ? ' or remove it' : ''}.
        </p>
      </div>

      {/* Seat Grid Layout */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Library Study Hall Grid</span>
            <span className="text-xs text-slate-400 font-medium">Entrance 🚪</span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
            {sortSeatsByNumber(seats).map((seat) => {
              const isOccupied = seat.status === 'Occupied';
              const isMaintenance = seat.status === 'Maintenance';

              return (
                <button
                  key={seat._id || seat.seatNumber}
                  onClick={() => handleSeatClick(seat)}
                  className={`relative p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 group ${
                    isOccupied
                      ? 'bg-rose-50 border-rose-300 hover:border-rose-500 text-rose-900 shadow-sm'
                      : isMaintenance
                      ? 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-800'
                      : 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-400 text-emerald-800 hover:shadow-md'
                  }`}
                >
                  <Armchair
                    className={`w-6 h-6 transition-transform group-hover:scale-110 ${
                      isOccupied ? 'text-rose-600' : isMaintenance ? 'text-amber-500' : 'text-emerald-600'
                    }`}
                  />
                  <span className="font-extrabold text-sm">{formatSeatNumber(seat.seatNumber)}</span>
                  <span
                    className={`text-[9px] font-bold uppercase px-1 rounded truncate max-w-full ${
                      isOccupied
                        ? 'bg-rose-200/70 text-rose-900'
                        : isMaintenance
                        ? 'bg-amber-200/60 text-amber-800'
                        : 'bg-emerald-200/60 text-emerald-800'
                    }`}
                  >
                    {isOccupied ? seat.studentName?.split(' ')[0] || 'Active' : seat.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Seat Detail Modal */}
      {modalOpen && selectedSeat && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Armchair className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Seat {formatSeatNumber(selectedSeat.seatNumber)}</h3>
                  <p className="text-xs text-slate-400">{selectedSeat.floor || 'Floor 1'}</p>
                </div>
              </div>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  selectedSeat.status === 'Occupied'
                    ? 'bg-rose-100 text-rose-700'
                    : selectedSeat.status === 'Maintenance'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {selectedSeat.status}
              </span>
            </div>

            <div className="py-4 space-y-3">
              {selectedSeat.status === 'Occupied' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <p className="text-slate-400 font-semibold">Assigned Student:</p>
                  <p className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <User className="w-4 h-4 text-indigo-600" />
                    {selectedSeat.studentName}
                  </p>
                  <p className="text-slate-600">
                    <span className="font-semibold">Shift:</span> {selectedSeat.shift || 'Full Day'}
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-500 font-medium">Quick Status Controls:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={updating || selectedSeat.status === 'Available'}
                  onClick={() => updateSeatStatus('Available')}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-40"
                >
                  Mark Available
                </button>
                <button
                  disabled={updating || selectedSeat.status === 'Maintenance'}
                  onClick={() => updateSeatStatus('Maintenance')}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all disabled:opacity-40"
                >
                  Maintenance
                </button>
              </div>
              {isAdmin && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  {selectedSeat.status === 'Occupied' && (
                    <p className="text-xs text-rose-600">
                      Reassign active students before removing this seat.
                    </p>
                  )}
                  <button
                    disabled={updating || selectedSeat.status === 'Occupied'}
                    onClick={removeSelectedSeat}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {updating ? 'Updating...' : 'Remove this seat'}
                  </button>
                  <p className="text-[11px] text-slate-400">
                    Later seat numbers and their student assignments will shift down.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => setModalOpen(false)}
                className="w-full py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
