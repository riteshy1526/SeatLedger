import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { formatSeatNumber, sortSeatsByNumber } from '../utils/seatNumber';
import { calculateSlotFee, formatMonth } from '../utils/slotPricing';
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  Armchair,
  Sparkles,
  Edit2,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Students() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [shiftFilter, setShiftFilter] = useState('All');

  // Add modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentActionId, setStudentActionId] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [feeOverrideEnabled, setFeeOverrideEnabled] = useState(false);
  const [availableSlotsList, setAvailableSlotsList] = useState([]);
  const [slotFees, setSlotFees] = useState([]);
  const [librarySeats, setLibrarySeats] = useState([]);
  const [seatOptionsLoading, setSeatOptionsLoading] = useState(false);
  const [seatOptionsError, setSeatOptionsError] = useState('');
  const [formData, setFormData] = useState({
    studentName: '',
    seatNumber: '',
    shift: 'Full Day (24x7)',
    slots: ['Full Day (24x7)'],
    contactNo: '',
    email: '',
    fatherName: '',
    address: '',
    monthlyFee: 800,
  });

  const handleToggleSlot = (slotId) => {
    let newSlots = [];
    if (/full\s*day/i.test(slotId)) {
      newSlots = [slotId];
    } else {
      const current = (formData.slots || []).filter((slot) => !/full\s*day/i.test(slot));
      if (current.includes(slotId)) {
        newSlots = current.filter((s) => s !== slotId);
      } else {
        newSlots = [...current, slotId];
      }
      if (newSlots.length === 0) newSlots = [slotId];
    }
    setFormData({
      ...formData,
      slots: newSlots,
      shift: newSlots.join(' + '),
      monthlyFee: feeOverrideEnabled ? formData.monthlyFee : calculateSlotFee(slotFees, newSlots),
    });
  };

  useEffect(() => {
    fetchStudents();
  }, [search, statusFilter, shiftFilter]);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await api.get('/library/pricing');
        const slots = response.data.shifts || [];
        const rates = response.data.activeSchedule?.slotFees || [];
        setSlotFees(rates);
        setAvailableSlotsList(slots.map((id) => ({
          id,
          label: id.replace(/\s*\(([^)]*)\)/, ' ($1)'),
          icon: /full\s*day/i.test(id) ? '⚡' : /morning/i.test(id) ? '☀️' : /afternoon/i.test(id) ? '🌤️' : '🌙',
        })));
        const defaultSlot = slots.find((slot) => /full\s*day/i.test(slot)) || slots[0];
        if (defaultSlot) {
          setFormData((current) => ({
            ...current,
            shift: defaultSlot,
            slots: [defaultSlot],
            monthlyFee: calculateSlotFee(rates, [defaultSlot]),
          }));
        }
      } catch (err) {
        console.error('Failed to load slot fees:', err);
      }
    };
    fetchPricing();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await api.get('/students', {
        params: {
          search,
          status: statusFilter,
          shift: shiftFilter,
        },
      });
      if (res.data.success) {
        setStudents(res.data.students);
        setLoadError('');
      } else {
        setLoadError('The server could not load the students list. Please try again.');
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
      setLoadError(err.response?.data?.message || 'Could not load students. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLibrarySeats = async () => {
    setSeatOptionsLoading(true);
    setSeatOptionsError('');
    try {
      const response = await api.get('/seats');
      if (!response.data.success) {
        throw new Error('Could not load this library’s seats.');
      }
      setLibrarySeats(sortSeatsByNumber(response.data.seats));
    } catch (err) {
      console.error('Failed to fetch library seats:', err);
      setSeatOptionsError(err.response?.data?.message || err.message || 'Could not load this library’s seats.');
    } finally {
      setSeatOptionsLoading(false);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = editingStudent
        ? await api.put(`/students/${editingStudent._id}`, {
          ...formData,
          monthlyFeeOverride: feeOverrideEnabled,
        })
        : await api.post('/students', formData);
      if (res.data.success) {
        setModalOpen(false);
        setEditingStudent(null);
        setFeeOverrideEnabled(false);
        const defaultSlot = availableSlotsList.find((slot) => /full\s*day/i.test(slot.id))?.id
          || availableSlotsList[0]?.id
          || 'Full Day (24x7)';
        setFormData({
          studentName: '',
          seatNumber: '',
          shift: defaultSlot,
          slots: [defaultSlot],
          contactNo: '',
          email: '',
          fatherName: '',
          address: '',
          monthlyFee: calculateSlotFee(slotFees, [defaultSlot]),
        });
        await fetchStudents();
      }
    } catch (err) {
      alert(
        err.response?.data?.message
        || err.response?.data?.error
        || err.message
        || (editingStudent ? 'Failed to update student' : 'Failed to add student')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStudentStatus = async (student) => {
    const nextStatus = student.status === 'Active' ? 'Inactive' : 'Active';
    const confirmation = nextStatus === 'Inactive'
      ? `Put ${student.studentName} on a temporary break? Their seat will be released, and their fee history will be kept.`
      : `Resume ${student.studentName}? Their previous seat may have been assigned to another student.`;
    if (!window.confirm(confirmation)) return;

    setStudentActionId(student._id);
    try {
      const response = await api.patch(`/students/${student._id}/status`, { status: nextStatus });
      await fetchStudents();
      alert(response.data.message || 'Student status updated.');
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'Could not update student status.');
    } finally {
      setStudentActionId(null);
    }
  };

  const handleRemoveStudent = async (student) => {
    const confirmed = window.confirm(
      `Permanently remove ${student.studentName}? Their student profile, linked portal account, fee history, and seat assignment will be deleted.`
    );
    if (!confirmed) return;

    setStudentActionId(student._id);
    try {
      const response = await api.delete(`/students/${student._id}`);
      await fetchStudents();
      alert(response.data.message || 'Student removed.');
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'Could not remove student.');
    } finally {
      setStudentActionId(null);
    }
  };

  const resetStudentForm = () => {
    const defaultSlot = availableSlotsList.find((slot) => /full\s*day/i.test(slot.id))?.id
      || availableSlotsList[0]?.id
      || 'Full Day (24x7)';
    setFormData({
      studentName: '',
      seatNumber: '',
      shift: defaultSlot,
      slots: [defaultSlot],
      contactNo: '',
      email: '',
      fatherName: '',
      address: '',
      monthlyFee: calculateSlotFee(slotFees, [defaultSlot]),
    });
  };

  const openAddStudent = () => {
    setEditingStudent(null);
    setFeeOverrideEnabled(false);
    resetStudentForm();
    setModalOpen(true);
  };

  const openEditStudent = (student) => {
    const slots = student.slots?.length ? student.slots : [student.shift];
    setEditingStudent(student);
    setFeeOverrideEnabled(Boolean(student.monthlyFeeOverride));
    setFormData({
      studentName: student.studentName || '',
      seatNumber: student.seatNumber || '',
      shift: student.shift || slots.join(' + '),
      slots,
      contactNo: student.contactNo || '',
      email: student.email || '',
      fatherName: student.fatherName || '',
      address: student.address || '',
      monthlyFee: student.monthlyFee ?? calculateSlotFee(slotFees, slots),
    });
    setModalOpen(true);
    fetchLibrarySeats();
  };

  const getRiskBadge = (level, score) => {
    if (!level) return null;
    if (level === 'High') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
          <Sparkles className="w-3 h-3 text-rose-500" />
          High Risk ({score}%)
        </span>
      );
    }
    if (level === 'Medium') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Sparkles className="w-3 h-3 text-amber-500" />
          Medium Risk ({score}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Sparkles className="w-3 h-3 text-emerald-500" />
        Low Risk ({score}%)
      </span>
    );
  };

  const editSeatOptions = editingStudent
    ? sortSeatsByNumber([
      ...librarySeats,
      ...(!librarySeats.some((seat) => seat.seatNumber === editingStudent.seatNumber)
        ? [{ seatNumber: editingStudent.seatNumber }]
        : []),
    ])
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Student Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage library memberships, seat reservations, and AI payment risk profiles
          </p>
        </div>

        <button
          onClick={openAddStudent}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          Register New Student
        </button>
      </div>

      {loadError && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={fetchStudents}
            className="self-start font-bold underline underline-offset-2 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, seat, contact..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>

          <select
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All Shifts</option>
            {availableSlotsList.map((slot) => (
              <option key={slot.id} value={slot.id}>{slot.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : loadError ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">Student list unavailable</p>
            <p className="text-xs text-slate-400">Use Retry above to load this library’s students.</p>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No students found</p>
            <p className="text-xs text-slate-400">Try adjusting your filters or register a new student.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-3 px-4">Student Details</th>
                  <th className="py-3 px-4">Seat & Shift</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Monthly Fee</th>
                  <th className="py-3 px-4">AI Risk Level</th>
                  <th className="py-3 px-4">Status</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st) => (
                  <tr key={st._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-800 text-sm">{st.studentName}</p>
                      <p className="text-[11px] text-slate-400">Father: {st.fatherName || 'N/A'}</p>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-700">
                        <Armchair className="w-3.5 h-3.5" />
                        Seat {formatSeatNumber(st.seatNumber)}
                      </div>
                      <p className="text-[11px] text-slate-500">{st.shift}</p>
                    </td>

                    <td className="py-3 px-4 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{st.contactNo}</span>
                      </div>
                      {st.email && (
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{st.email}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-800">
                      ₹{st.monthlyFee}
                      {st.upcomingMonthlyFee !== undefined && (
                        <p className="mt-0.5 text-[10px] font-semibold text-amber-600">
                          ₹{st.upcomingMonthlyFee} from {formatMonth(st.upcomingFeeEffectiveFrom)}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {getRiskBadge(st.aiRiskLevel, st.aiRiskScore)}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          st.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {st.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditStudent(st)}
                            aria-label={`Edit ${st.studentName}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStudentStatus(st)}
                            disabled={studentActionId === st._id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                          >
                            {studentActionId === st._id
                              ? 'Saving...'
                              : st.status === 'Active' ? 'Temporary Break' : 'Resume'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStudent(st)}
                            disabled={studentActionId === st._id}
                            aria-label={`Remove ${st.studentName}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Student Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-slate-800 text-base mb-4">
              {editingStudent ? `Edit ${editingStudent.studentName}` : 'Register New Student'}
            </h3>
            <form onSubmit={handleAddStudent} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Student Full Name</label>
                <input
                  type="text"
                  required
                  value={formData.studentName}
                  onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {!editingStudent && <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Seat Number</label>
                  <input
                    type="text"
                    required
                    value={formData.seatNumber}
                    onChange={(e) => setFormData({ ...formData, seatNumber: e.target.value.toUpperCase() })}
                    placeholder="e.g. 4"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>}
                {editingStudent && isAdmin && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Seat Number</label>
                    <select
                      required
                      value={formData.seatNumber}
                      disabled={seatOptionsLoading}
                      onChange={(e) => setFormData({ ...formData, seatNumber: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 font-bold disabled:bg-slate-100"
                    >
                      {editSeatOptions.map((seat) => (
                        <option key={seat.seatNumber} value={seat.seatNumber}>
                          {formatSeatNumber(seat.seatNumber)}
                        </option>
                      ))}
                    </select>
                    {seatOptionsLoading && <p className="mt-1 text-[10px] text-slate-500">Loading library seats...</p>}
                    {seatOptionsError && (
                      <p role="alert" className="mt-1 text-[10px] text-rose-600">
                        {seatOptionsError}{' '}
                        <button type="button" onClick={fetchLibrarySeats} className="font-bold underline">
                          Retry
                        </button>
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-slate-500">Seat must be available for the selected shift.</p>
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Monthly Fee (₹){editingStudent && feeOverrideEnabled ? ' — custom' : ''}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required={editingStudent && feeOverrideEnabled}
                    value={formData.monthlyFee}
                    readOnly={!editingStudent || !feeOverrideEnabled}
                    onChange={(e) => setFormData({ ...formData, monthlyFee: e.target.value === '' ? '' : Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 read-only:bg-slate-50"
                  />
                </div>
              </div>

              {editingStudent && (
                <label className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={feeOverrideEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setFeeOverrideEnabled(enabled);
                      if (!enabled) {
                        setFormData((current) => ({
                          ...current,
                          monthlyFee: calculateSlotFee(slotFees, current.slots),
                        }));
                      }
                    }}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <span>
                    <span className="block font-bold text-slate-700">Set a custom fee for this student</span>
                    <span>Otherwise the fee follows the library&apos;s slot rates. New amount applies from next month; past and current bills stay unchanged.</span>
                  </span>
                </label>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Booked Slot Timings <span className="text-[10px] text-indigo-600 font-semibold">(Multiple allowed)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availableSlotsList.map((slot) => {
                    const isSelected = (formData.slots || []).includes(slot.id);
                    return (
                      <button
                        type="button"
                        key={slot.id}
                        onClick={() => handleToggleSlot(slot.id)}
                        className={`p-2 rounded-lg border text-left text-xs transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-800 font-bold shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span>{slot.icon}</span>
                          <span className="truncate">{slot.label}</span>
                        </span>
                        {isSelected && <span className="text-indigo-600 text-xs font-black">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    value={formData.contactNo}
                    onChange={(e) => setFormData({ ...formData, contactNo: e.target.value })}
                    placeholder="9876543210"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="student@gmail.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Father's Name</label>
                <input
                  type="text"
                  value={formData.fatherName}
                  onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                  placeholder="Father's name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Student address"
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingStudent(null);
                    setFeeOverrideEnabled(false);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingStudent ? 'Save Changes' : 'Register Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
