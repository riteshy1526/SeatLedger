import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Send, ShieldCheck, Unlink } from 'lucide-react';
import api from '../services/api';

export default function PaymentSettings() {
  const [linkedAccountId, setLinkedAccountId] = useState('');
  const [connectedAccountId, setConnectedAccountId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');
  const [devCode, setDevCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [routeReferenceId, setRouteReferenceId] = useState('');
  const [routeTransferReadyAt, setRouteTransferReadyAt] = useState(null);

  useEffect(() => {
    const loadPaymentDetails = async () => {
      try {
        const response = await api.get('/library/payment-settings');
        const accountId = response.data.paymentDetails.razorpayLinkedAccountId || '';
        setLinkedAccountId(accountId);
        setConnectedAccountId(accountId);
        setRouteReferenceId(response.data.routeReferenceId || '');
        setRouteTransferReadyAt(response.data.routeTransferReadyAt || null);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Could not load payment settings.');
      } finally {
        setLoading(false);
      }
    };

    loadPaymentDetails();
  }, []);

  const requestVerificationCode = async () => {
    setSendingCode(true);
    setError('');
    setSuccess('');
    setDevCode('');
    try {
      const response = await api.post('/library/payment-settings/razorpay/send-otp', {
        razorpayLinkedAccountId: linkedAccountId,
      });
      setOtpSent(true);
      setVerificationCode('');
      setOtpSentTo(response.data.sentTo || '');
      setDevCode(response.data.devCode || '');
      setSuccess(response.data.message || 'Verification code sent.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not send the verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  const handleRequestCode = (event) => {
    event.preventDefault();
    requestVerificationCode();
  };

  const handleVerifyCode = async (event) => {
    event.preventDefault();
    setVerifyingCode(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/library/payment-settings/razorpay/verify-otp', {
        razorpayLinkedAccountId: linkedAccountId,
        code: verificationCode,
      });
      const accountId = response.data.paymentDetails.razorpayLinkedAccountId;
      setConnectedAccountId(accountId);
      setLinkedAccountId(accountId);
      setRouteTransferReadyAt(response.data.routeTransferReadyAt || null);
      setOtpSent(false);
      setVerificationCode('');
      setOtpSentTo('');
      setDevCode('');
      setSuccess(response.data.message || 'Razorpay account verified.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not verify the code.');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect this Razorpay account? Students will not be able to pay online until another account is verified.')) {
      return;
    }
    setDisconnecting(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.delete('/library/payment-settings/razorpay-account');
      setLinkedAccountId('');
      setConnectedAccountId('');
      setRouteTransferReadyAt(null);
      setOtpSent(false);
      setVerificationCode('');
      setOtpSentTo('');
      setDevCode('');
      setSuccess(response.data.message || 'Razorpay account disconnected.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not disconnect the Razorpay account.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-800">
          <CreditCard className="h-6 w-6 text-indigo-600" />
          Razorpay Route Payouts
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Connect this library&apos;s Razorpay Route account to receive online student fee payments.
        </p>
      </div>

      <form
        onSubmit={otpSent ? handleVerifyCode : handleRequestCode}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7"
      >
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Razorpay Route settlement</h3>
            <p className="mt-1 text-xs text-slate-500">
              Create a Linked Account under your platform&apos;s Razorpay Route account. Set its reference ID to:
              {' '}<code className="rounded bg-slate-100 px-1 py-0.5 font-mono">{routeReferenceId || 'Loading...'}</code>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              We&apos;ll send a verification code by SMS to the Linked Account&apos;s registered mobile number. Complete KYC and wait at least 24 hours after account creation before transfers.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
              Razorpay Linked Account ID
            </span>
            <input
              type="text"
              maxLength={100}
              required
              value={linkedAccountId}
              onChange={(event) => {
                setLinkedAccountId(event.target.value.trim());
                setOtpSent(false);
                setVerificationCode('');
                setOtpSentTo('');
                setDevCode('');
                setError('');
                setSuccess('');
              }}
              placeholder="acc_..."
              autoComplete="off"
              pattern="acc_[A-Za-z0-9]+"
              title="Enter the Razorpay Linked Account ID beginning with acc_."
              disabled={sendingCode || verifyingCode || disconnecting}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
            />
          </label>
          {connectedAccountId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-4 w-4" />
                Connected: {connectedAccountId}
              </span>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting || verifyingCode}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-800 disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          )}
          {otpSent && (
            <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-xs text-slate-700">
                Enter the 6-digit code sent by SMS to <strong>{otpSentTo}</strong>.
              </p>
              {devCode && (
                <p className="text-xs font-semibold text-amber-700">
                  Local development code: {devCode}
                </p>
              )}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                disabled={verifyingCode}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm tracking-[0.3em] text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={requestVerificationCode}
                disabled={sendingCode || verifyingCode}
                className="text-xs font-bold text-indigo-700 underline underline-offset-2 disabled:opacity-50"
              >
                {sendingCode ? 'Sending...' : 'Send a new code'}
              </button>
            </div>
          )}
          {routeTransferReadyAt && new Date(routeTransferReadyAt) > new Date() && (
            <p role="status" className="text-xs font-medium text-amber-700">
              Transfers will be available after {new Date(routeTransferReadyAt).toLocaleString()}.
            </p>
          )}
        </section>

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
            disabled={sendingCode || verifyingCode || disconnecting}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {otpSent ? <ShieldCheck className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {sendingCode
              ? 'Sending code...'
              : verifyingCode
                ? 'Verifying...'
                : otpSent
                  ? 'Verify and connect'
                  : 'Send verification code'}
          </button>
        </div>
      </form>
    </div>
  );
}
