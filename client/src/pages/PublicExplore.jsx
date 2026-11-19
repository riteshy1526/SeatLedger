import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatSeatNumber, sortSeatsByNumber } from '../utils/seatNumber';
import { calculateSlotFee, formatMonth } from '../utils/slotPricing';
import {
  Building2,
  MapPin,
  Phone,
  Armchair,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  User,
  ShieldCheck,
  Calendar,
} from 'lucide-react';

export default function PublicExplore({ onSwitchToLogin }) {
  const { completeLogin } = useAuth();
  const [libraries, setLibraries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('All');
  const [search, setSearch] = useState('');

  // Booking modal state
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedLib, setSelectedLib] = useState(null);
  const [libSeats, setLibSeats] = useState([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  // Form state
  const [bookingSeatNo, setBookingSeatNo] = useState('');
  const [studentName, setStudentName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [bookSuccess, setBookSuccess] = useState('');
  const [bookError, setBookError] = useState('');
  const [bookingVerificationRequired, setBookingVerificationRequired] = useState(false);
  const [bookingVerificationCode, setBookingVerificationCode] = useState('');

  const slotOptions = (selectedLib?.shifts || []).map((id) => ({
    id,
    label: id.replace(/\s*\(([^)]*)\)/, ' ($1)'),
    icon: /full\s*day/i.test(id) ? '⚡' : /morning/i.test(id) ? '☀️' : /afternoon/i.test(id) ? '🌤️' : '🌙',
  }));
  const selectedMonthlyFee = calculateSlotFee(selectedLib?.slotFees, selectedSlots);

  useEffect(() => {
    fetchLibraries();
  }, [selectedCity, search]);

  const fetchLibraries = async () => {
    try {
      setLoading(true);
      const res = await api.get('/public/libraries', {
        params: { city: selectedCity, search },
      });
      if (res.data.success) {
        setLibraries(res.data.libraries);
      }
    } catch (err) {
      console.error('Failed to fetch public libraries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBooking = async (lib) => {
    setSelectedLib(lib);
    const defaultSlot = (lib.shifts || []).find((shift) => /full\s*day/i.test(shift)) || lib.shifts?.[0];
    setSelectedSlots(defaultSlot ? [defaultSlot] : []);
    setBookingModalOpen(true);
    setBookSuccess('');
    setBookError('');
    setBookingVerificationRequired(false);
    setBookingVerificationCode('');
    setBookingSeatNo('');
    setLoadingSeats(true);
    try {
      const res = await api.get(`/public/libraries/${lib.id}/seats`);
      if (res.data.success) {
        setLibSeats(res.data.seats);
        setSelectedLib((current) => (
          current?.id === lib.id
            ? {
              ...current,
              totalSeats: res.data.totalSeats,
              vacantSeats: res.data.availableSeats,
              shifts: res.data.library.shifts,
              slotFees: res.data.library.slotFees,
            }
            : current
        ));
        const defaultSlot = (res.data.library.shifts || []).find((shift) => /full\s*day/i.test(shift))
          || res.data.library.shifts?.[0];
        setSelectedSlots(defaultSlot ? [defaultSlot] : []);
      }
    } catch (err) {
      console.error('Failed to load library seats:', err);
    } finally {
      setLoadingSeats(false);
    }
  };

  const toggleSlotSelection = (slotId) => {
    if (/full\s*day/i.test(slotId)) {
      setSelectedSlots([slotId]);
    } else {
      const current = selectedSlots.filter((slot) => !/full\s*day/i.test(slot));
      let updated = [];
      if (current.includes(slotId)) {
        updated = current.filter((s) => s !== slotId);
      } else {
        updated = [...current, slotId];
      }
      setSelectedSlots(updated.length > 0 ? updated : [slotId]);
    }
  };

  const handleSelfRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!bookingSeatNo) {
      setBookError('Please pick an available seat from the grid');
      return;
    }
    setSubmitting(true);
    setBookError('');
    try {
      const res = await api.post('/public/self-register', {
        libraryId: selectedLib.id,
        studentName,
        email,
        password,
        contactNo,
        fatherName,
        seatNumber: bookingSeatNo,
        slots: selectedSlots,
      });

      if (res.data.success) {
        if (res.data.verificationRequired) {
          setBookingVerificationRequired(true);
          setBookError('');
          setBookSuccess('');
        } else {
          setBookSuccess(`Seat ${formatSeatNumber(bookingSeatNo)} booked successfully at ${selectedLib.name}!`);
          localStorage.setItem('seatledger_token', res.data.token);
          localStorage.setItem('seatledger_user', JSON.stringify(res.data.user));
          localStorage.setItem('seatledger_library', JSON.stringify(res.data.library));
          window.location.reload();
        }
      }
    } catch (err) {
      if (err.response?.data?.verificationRequired) {
        setBookingVerificationRequired(true);
        setBookError(err.response.data.message || 'Enter the verification code sent to your email.');
      } else {
        setBookError(err.response?.data?.message || err.message || 'Seat booking failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyBookingEmail = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setBookError('');
    try {
      const response = await api.post('/auth/verify-email', {
        email,
        code: bookingVerificationCode,
      });
      completeLogin(response.data);
      setBookSuccess(`Seat ${formatSeatNumber(bookingSeatNo)} booked successfully at ${selectedLib.name}!`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setBookError(err.response?.data?.message || 'Email verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendBookingCode = async () => {
    setSubmitting(true);
    setBookError('');
    try {
      const response = await api.post('/auth/resend-verification', { identifier: email });
      setBookError(response.data.message || 'A new verification code has been requested.');
    } catch (err) {
      setBookError(err.response?.data?.message || 'Could not resend the verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-700 flex items-center justify-center font-black text-white text-lg shadow-md shadow-indigo-500/20">
              SL
            </div>
            <div>
              <h1 className="font-extrabold text-white text-lg tracking-tight">SeatLedger</h1>
              <p className="text-xs text-indigo-400 font-medium">Public Library Discovery & Seat Booking</p>
            </div>
          </div>

          <button
            onClick={onSwitchToLogin}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center gap-2"
          >
            <span>Library Staff / Admin Sign In</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="py-12 px-6 text-center max-w-4xl mx-auto space-y-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5" />
          Explore Libraries in Varanasi, Lucknow, Prayagraj & Beyond
        </span>
        <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          Find Your Perfect Study Seat & Book in Seconds
        </h2>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Search real study halls, check live available seat matrices, pick your preferred timing slot,
          and register online with zero waiting time at the desk.
        </p>

        {/* Filter Bar */}
        <div className="pt-4 max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by library name, area or landmark..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="w-full sm:w-auto px-4 py-3 rounded-xl bg-slate-800/90 border border-slate-700 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All Cities</option>
            <option value="Varanasi">Varanasi</option>
            <option value="Lucknow">Lucknow</option>
            <option value="Prayagraj">Prayagraj</option>
            <option value="Kanpur">Kanpur</option>
          </select>
        </div>
      </header>

      {/* Libraries Grid */}
      <main className="max-w-7xl mx-auto px-6 pb-16 flex-1 w-full">
        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
          </div>
        ) : libraries.length === 0 ? (
          <div className="text-center py-16 bg-slate-800/40 rounded-3xl border border-slate-800">
            <Building2 className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">No libraries found</h3>
            <p className="text-xs text-slate-400 mt-1">Try searching for a different city or term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {libraries.map((lib) => (
              <div
                key={lib.id}
                className="bg-slate-800/80 rounded-2xl border border-slate-700/80 hover:border-indigo-500/50 p-6 flex flex-col justify-between transition-all hover:shadow-xl group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {lib.name}
                      </h3>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{lib.address || lib.city}</span>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold whitespace-nowrap">
                      {lib.vacantSeats} Seats Vacant
                    </span>
                  </div>

                  <div className="my-4 py-3 border-y border-slate-700/60 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">Monthly Slot Fees</p>
                      <div className="mt-1 space-y-0.5">
                        {(lib.slotFees || []).map((fee) => (
                          <p key={fee.slot} className="text-xs font-semibold text-white">
                            {fee.slot.split('(')[0].trim()}: ₹{fee.monthlyFee}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-slate-400">Total Capacity</p>
                      <p className="text-base font-bold text-indigo-400 mt-0.5">{lib.totalSeats} Desks</p>
                    </div>
                  </div>

                  <div className="space-y-1 mb-6">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available Slots</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(lib.shifts || ['Full Day (24x7)']).map((shift, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-700/60 text-slate-300"
                        >
                          {shift.split('(')[0].trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenBooking(lib)}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <Armchair className="w-4 h-4" />
                  View Live Seats & Book
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Booking & Live Seat Grid Modal */}
      {bookingModalOpen && selectedLib && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedLib.name}</h3>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  {selectedLib.city} • Pick your seat & slot
                </p>
              </div>
              <button
                onClick={() => setBookingModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {bookSuccess ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-lg font-bold text-white">{bookSuccess}</h4>
                <p className="text-xs text-slate-400">Opening your personalized Student Portal now...</p>
              </div>
            ) : (
              <form onSubmit={bookingVerificationRequired ? handleVerifyBookingEmail : handleSelfRegisterSubmit} className="py-4 space-y-4">
                {bookError && (
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                    {bookError}
                  </div>
                )}

                {bookingVerificationRequired ? (
                  <div className="space-y-4 py-4">
                    <div>
                      <h4 className="text-base font-bold text-white">Verify your email to finish booking</h4>
                      <p className="mt-1 text-xs text-slate-400">Enter the 6-digit code sent to {email}.</p>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={bookingVerificationCode}
                      onChange={(event) => setBookingVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit code"
                      aria-label="Email verification code"
                      className="w-full px-3 py-3 rounded-lg bg-slate-800 border border-slate-700 text-center text-lg tracking-[0.4em] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="submit" disabled={submitting} className="w-full px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50">
                      {submitting ? 'Verifying...' : 'Verify Email & Sign In'}
                    </button>
                    <button type="button" disabled={submitting} onClick={handleResendBookingCode} className="w-full text-xs font-semibold text-indigo-300 hover:text-white disabled:opacity-50">
                      Resend code
                    </button>
                  </div>
                ) : (
                  <>
                {/* 1. Pick a Seat from Live Grid */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Step 1: Choose an Available Seat
                    </label>
                    <span className="text-[11px] text-emerald-400 font-semibold">
                      Available: {selectedLib.vacantSeats} / {selectedLib.totalSeats}
                      <span className="mx-2 text-slate-600">|</span>
                      Selected: {bookingSeatNo ? `Seat ${formatSeatNumber(bookingSeatNo)}` : 'None'}
                    </span>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded bg-emerald-500" />
                      Available
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded bg-rose-500" />
                      Booked
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded bg-amber-500" />
                      Unavailable
                    </span>
                  </div>

                  {loadingSeats ? (
                    <div className="p-6 text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto"></div>
                    </div>
                  ) : (
                    <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 max-h-48 overflow-y-auto">
                      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                        {sortSeatsByNumber(libSeats).map((seat) => {
                          const isOccupied = seat.status === 'Occupied';
                          const isUnavailable = isOccupied || ['Maintenance', 'Reserved'].includes(seat.status);
                          const isChosen = bookingSeatNo === seat.seatNumber;

                          return (
                            <button
                              type="button"
                              key={seat.seatNumber}
                              disabled={isUnavailable}
                              onClick={() => setBookingSeatNo(seat.seatNumber)}
                              title={isOccupied ? 'Booked' : seat.status}
                              className={`p-2 rounded-xl text-center border transition-all text-xs font-bold ${
                                isChosen
                                  ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/40 scale-105'
                                  : isOccupied
                                  ? 'bg-rose-500/15 border-rose-500/60 text-rose-200 cursor-not-allowed'
                                  : isUnavailable
                                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 cursor-not-allowed'
                                  : 'bg-slate-900 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/10'
                              }`}
                            >
                              <Armchair className="w-3.5 h-3.5 mx-auto mb-0.5" />
                              <span>{formatSeatNumber(seat.seatNumber)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Choose Timing Slots */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    Step 2: Select Slot Timings <span className="text-[10px] text-indigo-400 lowercase">(Multiple allowed)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {slotOptions.map((slot) => {
                      const isSel = selectedSlots.includes(slot.id);
                      const slotFee = selectedLib.slotFees?.find((fee) => fee.slot === slot.id)?.monthlyFee ?? 0;
                      return (
                        <button
                          type="button"
                          key={slot.id}
                          onClick={() => toggleSlotSelection(slot.id)}
                          className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                            isSel
                              ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-bold'
                              : 'bg-slate-800/50 border-slate-700/80 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span>{slot.icon}</span>
                            <span className="truncate">{slot.label}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-[10px]">₹{slotFee}/mo</span>
                            {isSel && <span className="text-indigo-400 text-xs">✓</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-right text-xs font-bold text-indigo-300">
                    Monthly total: ₹{selectedMonthlyFee}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-slate-400">
                    Selected slot fees are added together; Full Day uses its own rate.
                  </p>
                </div>

                {/* 3. Student Credentials */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Step 3: Student Account Details
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="Rohan Kumar"
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        required
                        value={contactNo}
                        onChange={(e) => setContactNo(e.target.value)}
                        placeholder="9876543210"
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Email</label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="rohan@gmail.com"
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Set Password (min 6 chars)</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
                  </>
                )}

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setBookingModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  {!bookingVerificationRequired && <button
                    type="submit"
                    disabled={submitting || !bookingSeatNo}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
                  >
                    {submitting ? 'Confirming Reservation...' : `Confirm & Reserve Seat ${bookingSeatNo ? formatSeatNumber(bookingSeatNo) : ''}`}
                  </button>}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
