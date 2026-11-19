import React, { useEffect, useState } from 'react';
import api from '../services/api';
import StatCard from '../components/StatCard';
import {
  Users,
  Armchair,
  IndianRupee,
  Clock,
  Sparkles,
  AlertTriangle,
  ArrowUpRight,
  Send,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function Dashboard({ setActiveTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await api.get('/analytics/dashboard');
      if (res.data.success) {
        setData(res.data);
      } else {
        setLoadError(res.data.message || res.data.error || 'Could not load dashboard data.');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setLoadError(
        err.response?.data?.message
        || err.response?.data?.error
        || err.message
        || 'Could not load dashboard data.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-10 w-10 text-rose-400" />
        <p role="alert" className="text-sm font-semibold text-rose-700">
          {loadError || 'Could not load dashboard data.'}
        </p>
        <button
          type="button"
          onClick={fetchDashboardData}
          className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const { stats, charts } = data;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">Executive Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time library occupancy, revenue health, and predictive analytics
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('ai')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md shadow-indigo-500/20 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Predict Defaulters
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm transition-all"
          >
            <Send className="w-3.5 h-3.5 text-indigo-600" />
            Send Reminders
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Occupancy Rate"
          value={`${stats.occupancyRate}%`}
          subValue={`${stats.occupiedSeats} / ${stats.totalSeats} seats filled`}
          icon={Armchair}
          color="indigo"
        />

        <StatCard
          title="Active Students"
          value={stats.totalActiveStudents}
          subValue={`${stats.availableSeats} seats currently available`}
          icon={Users}
          color="emerald"
        />

        <StatCard
          title="Collected This Month"
          value={`₹${stats.currentCollected.toLocaleString('en-IN')}`}
          subValue={`${stats.collectionPercentage}% collection efficiency`}
          icon={IndianRupee}
          color="blue"
        />

        <StatCard
          title="Pending Dues"
          value={`₹${stats.currentDue.toLocaleString('en-IN')}`}
          subValue={`${stats.highRiskDefaultersCount} high risk students`}
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Recharts Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Revenue Trend Area Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Monthly Revenue & Collection Trend</h3>
              <p className="text-xs text-slate-400">Past 6 months collected vs pending dues</p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Live MERN Feed
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.monthlyTrend}>
                <defs>
                  <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="monthName" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  formatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', borderColor: '#e2e8f0', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorCollected)" />
                <Area type="monotone" dataKey="pending" name="Pending Dues" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorPending)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Shift Distribution Pie Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm">Occupancy by Shift</h3>
            <p className="text-xs text-slate-400">Distribution across active slots</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.shiftDistribution}
                  dataKey="students"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {charts.shiftDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill || '#6366f1'} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [`${v} Students`, name]}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Fee Status Breakdown & AI Defaulter Teaser */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fee Status Bar Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Fee Collection Status</h3>
          <p className="text-xs text-slate-400 mb-4">Paid vs Partial vs Due records</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.feeStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="status" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: '10px', fontSize: '12px' }} />
                <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]}>
                  {charts.feeStatus.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Prediction Highlight Card */}
        <div className="lg:col-span-2 bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                FastAPI Machine Learning Twist
              </span>
              <span className="text-xs text-slate-400">Next Month Forecast</span>
            </div>
            <h3 className="text-lg font-bold">Predictive Fee Defaulter Engine</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
              SeatLedger’s integrated AI service scans student historical payment delays, dues, and shift tenure
              to forecast which students are likely to delay fees next month. This allows library owners to take
              proactive intervention steps before revenue is lost.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-700/60">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <p className="text-slate-400">High Risk Identified</p>
                <p className="text-xl font-bold text-rose-400">{stats.highRiskDefaultersCount} Students</p>
              </div>
              <div className="h-8 w-px bg-slate-700"></div>
              <div>
                <p className="text-slate-400">Preventable At-Risk Revenue</p>
                <p className="text-xl font-bold text-amber-300">₹{(stats.highRiskDefaultersCount * 800).toLocaleString('en-IN')}</p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('ai')}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
            >
              Open AI Defaulter Panel
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
