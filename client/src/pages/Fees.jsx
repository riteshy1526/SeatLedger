import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { formatSeatNumber } from '../utils/seatNumber';
import {
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlusCircle,
  IndianRupee,
  CreditCard,
  Send,
  Calendar,
  Download,
  Edit2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { printFeeReceipt } from '../services/receiptGenerator';

export default function Fees({ setActiveTab }) {
  const { library, isAdmin } = useAuth();
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState('All');

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedFee, setSelectedFee] = useState(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feeEditOpen, setFeeEditOpen] = useState(false);
  const [feeBeingEdited, setFeeBeingEdited] = useState(null);
  const [monthlyFeeInput, setMonthlyFeeInput] = useState('');
  const [updatingFee, setUpdatingFee] = useState(false);
  const [resettingFeeId, setResettingFeeId] = useState(null);

  useEffect(() => {
    fetchFees();
  }, [month, year, statusFilter]);

  const fetchFees = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await api.get('/fees', {
        params: { month, year, status: statusFilter },
      });
      if (res.data.success) {
        setFees(res.data.fees);
      } else {
        setFees([]);
        setLoadError(res.data.message || res.data.error || 'Could not load fee records.');
      }
    } catch (err) {
      console.error('Failed to fetch fees:', err);
      setFees([]);
      setLoadError(
        err.response?.data?.message
        || err.response?.data?.error
        || err.message
        || 'Could not load fee records.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMonthly = async () => {
    setGenerating(true);
    try {
      const res = await api.post('/fees/generate-monthly', { month, year });
      alert(res.data.message || 'Monthly fees generated!');
      await fetchFees();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate fees');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenPaymentModal = (fee) => {
    setSelectedFee(fee);
    setCollectAmount(fee.balance);
    setPaymentModalOpen(true);
  };

  const handleOpenFeeEdit = (fee) => {
    setFeeBeingEdited(fee);
    setMonthlyFeeInput(String(fee.amountDue));
    setFeeEditOpen(true);
  };

  const handleUpdateMonthlyFee = async (e) => {
    e.preventDefault();
    if (!feeBeingEdited) return;
    setUpdatingFee(true);
    try {
      const response = await api.put(`/fees/${feeBeingEdited._id}/monthly-fee`, {
        monthlyFee: Number(monthlyFeeInput),
      });
      setFeeEditOpen(false);
      setFeeBeingEdited(null);
      await fetchFees();
      alert(response.data.message || 'Monthly fee updated.');
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'Failed to update monthly fee.');
    } finally {
      setUpdatingFee(false);
    }
  };

  const handleMarkUnpaid = async (fee) => {
    if (!window.confirm(
      `Reset ${fee.studentId?.studentName || 'this student'}'s manually recorded payment of ₹${fee.amountPaid} and mark the fee due again?`
    )) return;

    setResettingFeeId(fee._id);
    try {
      const response = await api.put(`/fees/${fee._id}/mark-unpaid`);
      await fetchFees();
      alert(response.data.message || 'Fee marked due again.');
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'Could not reset the fee status.');
    } finally {
      setResettingFeeId(null);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedFee) return;
    setCollecting(true);
    try {
      await api.post('/fees/collect-offline', {
        feeId: selectedFee._id,
        amountPaid: Number(collectAmount),
        paymentMethod,
        notes,
      });
      setPaymentModalOpen(false);
      await fetchFees();
    } catch (err) {
      alert('Failed to record payment');
    } finally {
      setCollecting(false);
    }
  };

  const copyPaymentLink = (feeId) => {
    const link = `${window.location.origin}/pay/${feeId}`;
    navigator.clipboard.writeText(link);
    alert(`Razorpay Payment Link copied:\n${link}`);
  };

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Fee Ledger & Settlements</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track student monthly dues, record counter payments, and generate Razorpay links
          </p>
        </div>

        <button
          onClick={handleGenerateMonthly}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 transition-all disabled:opacity-50"
        >
          <PlusCircle className="w-4 h-4" />
          {generating ? 'Generating...' : `Auto-Generate ${monthsList[month - 1]} Fees`}
        </button>
      </div>

      {/* Month & Status Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Billing Period:</span>
          </div>

          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            {monthsList.map((m, idx) => (
              <option key={m} value={idx + 1}>{m}</option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All Records</option>
            <option value="Paid">Paid</option>
            <option value="Partial">Partial</option>
            <option value="Due">Overdue / Due</option>
          </select>
        </div>
      </div>

      {/* Fees Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : loadError ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-10 h-10 text-rose-300 mx-auto mb-2" />
            <p role="alert" className="text-sm font-semibold text-rose-700">{loadError}</p>
            <button
              type="button"
              onClick={fetchFees}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
            >
              Retry
            </button>
          </div>
        ) : fees.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No fee records found for this period</p>
            <p className="text-xs text-slate-400">Click "Auto-Generate Fees" to populate for active students.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Seat</th>
                  <th className="py-3 px-4">Fee Due</th>
                  <th className="py-3 px-4">Paid</th>
                  <th className="py-3 px-4">Balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fees.map((fee) => {
                  const student = fee.studentId;
                  const isPaid = fee.status === 'Paid';
                  const isPartial = fee.status === 'Partial';

                  return (
                    <tr key={fee._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-800 text-sm">{student?.studentName || 'Student'}</p>
                        <p className="text-[11px] text-slate-400">{student?.contactNo}</p>
                      </td>

                      <td className="py-3 px-4 font-bold text-indigo-700">
                        {student?.seatNumber ? formatSeatNumber(student.seatNumber) : 'N/A'}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-700">
                        ₹{fee.amountDue}
                      </td>

                      <td className="py-3 px-4 font-semibold text-emerald-600">
                        ₹{fee.amountPaid}
                      </td>

                      <td className="py-3 px-4 font-bold text-rose-600">
                        ₹{fee.balance}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : isPartial
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-rose-100 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {fee.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-500 font-medium">
                        {fee.paymentMethod || 'None'}
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        {isAdmin
                          && fee.status !== 'Paid'
                          && fee.month === new Date().getMonth() + 1
                          && fee.year === new Date().getFullYear()
                          && (
                            <button
                              onClick={() => handleOpenFeeEdit(fee)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all"
                            >
                              <Edit2 className="inline w-3 h-3 mr-1" />
                              Update Fee
                            </button>
                          )}
                        {!isPaid && (
                          <>
                            <button
                              onClick={() => handleOpenPaymentModal(fee)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all"
                            >
                              Collect Cash/UPI
                            </button>
                            <button
                              onClick={() => copyPaymentLink(fee._id)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all"
                              title="Copy Razorpay Checkout Link"
                            >
                              Copy Link
                            </button>
                          </>
                        )}
                        {isPaid && (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Settled
                            </span>
                            {isAdmin
                              && fee.paymentMethod !== 'Razorpay'
                              && !fee.razorpayPaymentId
                              && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkUnpaid(fee)}
                                  disabled={resettingFeeId === fee._id}
                                  className="px-2 py-1 text-[11px] font-bold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 disabled:opacity-50"
                                >
                                  {resettingFeeId === fee._id ? 'Updating...' : 'Mark Unpaid'}
                                </button>
                              )}
                            <button
                              onClick={() => printFeeReceipt({ fee, student: fee.studentId, library })}
                              className="px-2 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 border border-slate-200 transition-all flex items-center gap-1"
                              title="Print or Save PDF Receipt"
                            >
                              <Download className="w-3 h-3 text-indigo-600" />
                              PDF
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentModalOpen && selectedFee && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <h3 className="font-bold text-slate-800 text-base mb-1">Record Fee Collection</h3>
            <p className="text-xs text-slate-400 mb-4">
              Student: <span className="font-semibold text-slate-700">{selectedFee.studentId?.studentName}</span>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Amount to Collect (₹)
                </label>
                <input
                  type="number"
                  required
                  max={selectedFee.balance}
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">Remaining balance: ₹{selectedFee.balance}</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Cash">Cash (Counter)</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Bank Transfer">Bank Transfer (IMPS/NEFT)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Receipt Note (Optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Paid at desk via PhonePe"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collecting}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow disabled:opacity-50"
                >
                  {collecting ? 'Saving...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {feeEditOpen && feeBeingEdited && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base mb-1">Update Monthly Fee</h3>
            <p className="text-xs text-slate-500 mb-4">
              {feeBeingEdited.studentId?.studentName} · Current month and future unpaid bills will update. Past and paid records stay unchanged.
            </p>
            <form onSubmit={handleUpdateMonthlyFee} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  New monthly fee (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={monthlyFeeInput}
                  onChange={(e) => setMonthlyFeeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFeeEditOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingFee}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                >
                  {updatingFee ? 'Updating...' : 'Save Fee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
