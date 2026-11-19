import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { formatSeatNumber } from '../utils/seatNumber';
import { formatMonth } from '../utils/slotPricing';
import { useAuth } from '../context/AuthContext';
import {
  Armchair,
  Receipt,
  CreditCard,
  CheckCircle2,
  Clock,
  Building2,
  ShieldCheck,
  Calendar,
  Download,
} from 'lucide-react';
import { printFeeReceipt } from '../services/receiptGenerator';

let razorpayCheckoutPromise;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayCheckoutPromise) {
    razorpayCheckoutPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        if (window.Razorpay) {
          resolve();
        } else {
          razorpayCheckoutPromise = null;
          reject(new Error('Razorpay Checkout could not be initialized.'));
        }
      };
      script.onerror = () => {
        razorpayCheckoutPromise = null;
        reject(new Error('Could not load Razorpay Checkout. Check your internet connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }
  return razorpayCheckoutPromise;
}

export default function StudentPortal() {
  const { user, library } = useAuth();
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingFeeId, setPayingFeeId] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentConfig, setPaymentConfig] = useState(null);

  const studentProfile = user?.studentProfile;

  useEffect(() => {
    if (user?.studentProfileId || studentProfile?._id) {
      fetchStudentFees();
      api.get('/payments/config')
        .then((response) => setPaymentConfig(response.data))
        .catch((error) => console.error('Failed to load Razorpay status:', error));
    }
  }, [user]);

  const fetchStudentFees = async () => {
    try {
      setLoading(true);
      const studentId = studentProfile?._id || user?.studentProfileId;
      const res = await api.get(`/fees/student/${studentId}`);
      if (res.data.success) {
        setFees(res.data.fees);
      }
    } catch (err) {
      console.error('Failed to load student fees:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpayPayment = async (fee) => {
    setPayingFeeId(fee._id);
    setPaymentSuccess('');
    setPaymentError('');
    try {
      // 1. Create Order on Backend
      const res = await api.post('/payments/create-order', { feeId: fee._id });
      if (!res.data.success) {
        throw new Error(res.data.message || 'Failed to create payment order');
      }

      const { order, keyId, student, libraryName, paymentMode } = res.data;
      setPaymentConfig((current) => ({ ...current, enabled: true, mode: paymentMode }));

      // 2. Open Razorpay Checkout Modal
      await loadRazorpayCheckout();
      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: libraryName || library?.name || 'SeatLedger Library',
        description: `Library Seat Monthly Fee (${fee.month}/${fee.year})`,
        order_id: order.id,
        prefill: {
          name: student?.name || user?.name,
          email: student?.email || user?.email,
          contact: student?.contact || user?.phone,
        },
        theme: {
          color: '#4f46e5',
        },
        handler: async (response) => {
          // 3. Verify Payment on Backend
          try {
            if (!response.razorpay_order_id || !response.razorpay_payment_id || !response.razorpay_signature) {
              throw new Error('Razorpay returned incomplete payment verification details.');
            }
            const verifyRes = await api.post('/payments/verify', {
              feeId: fee._id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyRes.data.success) {
              setPaymentSuccess(`Payment of ₹${fee.balance} successful! Seat access renewed.`);
              await fetchStudentFees();
            }
          } catch (vErr) {
            setPaymentError(
              vErr.response?.data?.message || `Payment verification failed: ${vErr.message}`
            );
          } finally {
            setPayingFeeId(null);
          }
        },
        modal: {
          ondismiss: () => {
            setPayingFeeId(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setPaymentError(
        err.response?.data?.message
          || err.response?.data?.error
          || `Could not start Razorpay checkout: ${err.message}`
      );
    } finally {
      setPayingFeeId(null);
    }
  };

  const currentDueFee = fees.find((f) => f.status === 'Due' || f.status === 'Partial');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Welcome Hero */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-indigo-200 border border-white/20 text-xs font-semibold mb-3">
            <Building2 className="w-3.5 h-3.5" />
            {library?.name || 'Library Study Point'} • {library?.city}
          </span>

          <h2 className="text-3xl font-extrabold tracking-tight">
            Namaste, {user?.name}! 👋
          </h2>
          <p className="text-xs text-indigo-200 mt-1 max-w-lg">
            Manage your seat reservation, check current fee balance, and make secure online fee payments via Razorpay.
          </p>
        </div>
      </div>

      {paymentSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {paymentSuccess}
        </div>
      )}
      {paymentError && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {paymentError}
        </div>
      )}
      {paymentConfig?.enabled === false && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Online payments are not configured yet. Please contact your library administrator.
        </div>
      )}
      {paymentConfig?.mode === 'test' && (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Razorpay is in test mode. Test payments do not transfer real money.
        </div>
      )}

      {/* Grid: Seat Details + Due Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Seat Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Assigned Seat</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              Active Member
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-black text-2xl flex items-center justify-center">
              <Armchair className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800">
                {studentProfile?.seatNumber && studentProfile.seatNumber !== 'Pending Allocation'
                  ? `Seat ${formatSeatNumber(studentProfile.seatNumber)}`
                  : 'Seat: Allocation Pending'}
              </p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {studentProfile?.seatNumber === 'Pending Allocation'
                  ? 'Library desk / admin dwara seat assign ki jayegi'
                  : (studentProfile?.shift || 'Full Day (24x7)')}
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-400">Monthly Plan</p>
              <p className="font-bold text-slate-800 mt-0.5">₹{studentProfile?.monthlyFee ?? 800}/month</p>
              {studentProfile?.upcomingMonthlyFee !== undefined && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600">
                  ₹{studentProfile.upcomingMonthlyFee}/month from {formatMonth(studentProfile.upcomingFeeEffectiveFrom)}
                </p>
              )}
            </div>
            <div>
              <p className="text-slate-400">Seat Status</p>
              <p className={`font-bold mt-0.5 flex items-center gap-1 ${
                studentProfile?.seatNumber === 'Pending Allocation' ? 'text-amber-600' : 'text-emerald-600'
              }`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {studentProfile?.seatNumber === 'Pending Allocation' ? 'Desk Action Required' : 'Reserved'}
              </p>
            </div>
          </div>
        </div>

        {/* Current Due & Pay Now */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Due Status</span>
              {currentDueFee ? (
                <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due Pending
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All Dues Cleared
                </span>
              )}
            </div>

            <p className="text-3xl font-extrabold text-slate-800 mt-2">
              ₹{currentDueFee ? currentDueFee.balance : 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {currentDueFee
                ? `Due for ${currentDueFee.month}/${currentDueFee.year}`
                : 'No outstanding dues. You are all set for this month!'}
            </p>
          </div>

          <div className="mt-6">
            {currentDueFee ? (
              <button
                onClick={() => handleRazorpayPayment(currentDueFee)}
                disabled={payingFeeId === currentDueFee._id || paymentConfig?.enabled === false}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                {payingFeeId === currentDueFee._id ? 'Opening Razorpay...' : `Pay ₹${currentDueFee.balance} via Razorpay`}
              </button>
            ) : (
              <div className="p-3 bg-emerald-50 rounded-xl text-center text-xs font-semibold text-emerald-700 border border-emerald-100">
                Seat reservation guaranteed. Next billing next month.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-sm">Payment History & Receipts</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
        ) : fees.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No past fee records on file.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50 text-slate-500 uppercase font-bold">
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Amount Due</th>
                  <th className="py-3 px-4">Amount Paid</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fees.map((fee) => (
                  <tr key={fee._id}>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {fee.month}/{fee.year}
                    </td>
                    <td className="py-3 px-4">₹{fee.amountDue}</td>
                    <td className="py-3 px-4 font-semibold text-emerald-600">₹{fee.amountPaid}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          fee.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {fee.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{fee.paymentMethod || 'None'}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {fee.status !== 'Paid' ? (
                        <button
                          onClick={() => handleRazorpayPayment(fee)}
                          disabled={payingFeeId === fee._id || paymentConfig?.enabled === false}
                          className="px-3 py-1 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Pay Online
                        </button>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-emerald-600 font-semibold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                          </span>
                          <button
                            onClick={() => printFeeReceipt({ fee, student: studentProfile || user, library })}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-bold rounded-lg text-xs border border-slate-200 transition-all flex items-center gap-1"
                            title="Print or Save PDF Receipt"
                          >
                            <Download className="w-3 h-3 text-indigo-600" />
                            PDF Receipt
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
