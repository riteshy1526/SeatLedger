import React, { useEffect, useState } from 'react';
import api from '../services/api';
import {
  BellRing,
  Send,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';

export default function Reminders() {
  const [logs, setLogs] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('WHATSAPP');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [resultError, setResultError] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchSystemStatus();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reminders/logs');
      if (res.data.success) {
        setLogs(res.data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch reminder logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await api.get('/reminders/status');
      if (res.data.success) setSystemStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch reminder system status:', err);
    }
  };

  const handleSendBulk = async () => {
    if (!isSelectedChannelReady) return;
    if (!confirm(`Are you sure you want to queue automatic ${channel} reminders for all students with pending fees?`)) {
      return;
    }
    setSendingBulk(true);
    setResultMsg('');
    setResultError(false);
    try {
      const res = await api.post('/reminders/send-bulk-due', { channel });
      setResultMsg(res.data.message || `Queued ${channel} reminders!`);
      await fetchLogs();
    } catch (err) {
      const responseMessage = err.response?.data?.message || err.message || 'Failed to queue reminders';
      const missingConfiguration = err.response?.data?.missingConfiguration;
      setResultMsg(
        missingConfiguration?.length
          ? `${responseMessage} Missing: ${missingConfiguration.join(', ')}`
          : responseMessage
      );
      setResultError(true);
    } finally {
      setSendingBulk(false);
    }
  };

  const selectedChannelConfigured = channel === 'WHATSAPP'
    ? systemStatus?.whatsAppConfigured
    : systemStatus?.emailConfigured;
  const selectedChannelEnabled = channel === 'WHATSAPP'
    ? systemStatus?.schedule.whatsAppEnabled
    : systemStatus?.schedule.emailEnabled;
  const isSelectedChannelReady = Boolean(selectedChannelConfigured && selectedChannelEnabled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Automated Due Reminders</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scheduled fee reminders and delivery status
          </p>
        </div>

        <button
          onClick={() => {
            fetchLogs();
            fetchSystemStatus();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Delivery Logs
        </button>
      </div>

      {systemStatus && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {systemStatus.emailConfigured
              && systemStatus.whatsAppConfigured
              && systemStatus.appBaseUrlConfigured ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">
                Daily schedule: {systemStatus.schedule.daysBeforeDue} day(s) before due at 09:00 India time
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Scheduler: {systemStatus.schedulerMode}. Email: {systemStatus.schedule.emailEnabled
                  ? (systemStatus.emailConfigured ? 'ready' : 'provider not configured')
                  : 'disabled for this library'}. WhatsApp: {systemStatus.schedule.whatsAppEnabled
                  ? (systemStatus.whatsAppConfigured ? 'ready' : 'Meta template/provider not configured')
                  : 'disabled for this library'}. Public app URL: {systemStatus.appBaseUrlConfigured ? 'configured' : 'not configured'}.
              </p>
              {systemStatus.schedulerMode === 'In-process fallback' && (
                <p className="mt-1 text-xs text-amber-700">
                  Redis is unavailable; the schedule runs only while this backend process is running. Configure Redis for durable scheduling.
                </p>
              )}
              {systemStatus.schedule.whatsAppEnabled && !systemStatus.whatsAppConfigured && (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  WhatsApp needs these server/.env settings: {systemStatus.whatsAppMissingConfiguration.join(', ') || 'check Meta WhatsApp configuration'}. Restart the backend after adding them.
                </p>
              )}
              {!systemStatus.appBaseUrlConfigured && (
                <p className="mt-1 text-xs text-amber-800">
                  Set APP_BASE_URL to the public frontend URL to enable automatic reminders with working payment links.
                </p>
              )}
            </div>
            <Clock className="hidden h-5 w-5 shrink-0 text-indigo-500 sm:block" />
          </div>
        </div>
      )}

      {/* Action Banner */}
      <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 text-[11px] font-bold border border-indigo-400/20">
                Automatic Schedule
              </span>
            </div>
            <h3 className="text-lg font-bold">One-Click Fee Collection Dispatch</h3>
            <p className="text-xs text-indigo-100 leading-relaxed">
              Dispatches personalized reminder messages including the student's exact pending amount,
              due date, and secure Razorpay payment link. Powered by BullMQ retry backoff and rate-limiting.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur p-4 rounded-xl border border-white/15 w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center bg-black/20 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setChannel('WHATSAPP')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  channel === 'WHATSAPP' ? 'bg-emerald-500 text-white shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setChannel('EMAIL')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  channel === 'EMAIL' ? 'bg-indigo-500 text-white shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
            </div>

            <button
              onClick={handleSendBulk}
              disabled={sendingBulk || !isSelectedChannelReady}
              title={!isSelectedChannelReady ? `Configure and enable ${channel} before dispatching` : undefined}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs bg-white text-indigo-900 hover:bg-indigo-50 shadow-lg shadow-black/10 transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5 text-indigo-600" />
              {sendingBulk
                ? 'Enqueuing Jobs...'
                : isSelectedChannelReady
                  ? `Dispatch ${channel} Reminders`
                  : `Configure ${channel} first`}
            </button>
          </div>
        </div>

        {resultMsg && (
          <div className={`mt-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            resultError
              ? 'bg-rose-500/20 border-rose-400/30 text-rose-100'
              : 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200'
          }`}>
            {resultError
              ? <AlertCircle className="w-4 h-4 shrink-0 text-rose-300" />
              : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
            {resultMsg}
          </div>
        )}
      </div>

      {/* Reminder Delivery Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Automated Delivery Audit Trail</h3>
          <span className="text-xs text-slate-400">{logs.length} logged dispatches</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <BellRing className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No reminders sent yet</p>
            <p className="text-xs text-slate-400">Click the dispatch button above to notify students with dues.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Recipient Target</th>
                  <th className="py-3 px-4">Pending Amount</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {log.studentName || 'Student'}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[10px] ${
                          log.channel === 'WHATSAPP'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {log.channel === 'WHATSAPP' ? (
                          <MessageSquare className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Mail className="w-3 h-3 text-indigo-600" />
                        )}
                        {log.channel}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-medium">
                      {log.recipient}
                    </td>

                    <td className="py-3 px-4 font-bold text-rose-600">
                      ₹{log.amount}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          log.status === 'Sent'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : log.status === 'Queued'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : log.status === 'Simulated'
                            ? 'bg-violet-100 text-violet-700 border border-violet-200'
                            : 'bg-rose-100 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {log.status}
                      </span>
                      {log.errorMessage && (
                        <p className="mt-1 max-w-xs whitespace-normal break-words text-[10px] font-medium normal-case text-rose-700">
                          {log.errorMessage}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-400">
                      {new Date(log.sentAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
