import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { formatSeatNumber } from '../utils/seatNumber';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  BrainCircuit,
  TrendingDown,
  RefreshCw,
  Send,
  Armchair,
  ShieldAlert,
} from 'lucide-react';

export default function AIDefaulterPredictor() {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [stats, setStats] = useState(null);
  const [engineUsed, setEngineUsed] = useState('');

  useEffect(() => {
    fetchDefaulters();
  }, []);

  const fetchDefaulters = async () => {
    try {
      setLoading(true);
      const res = await api.get('/ai/defaulters-summary');
      if (res.data.success) {
        setPredictions(res.data.defaulters);
      }
    } catch (err) {
      console.error('Failed to fetch defaulters summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAI = async () => {
    setPredicting(true);
    try {
      const res = await api.post('/ai/predict-all');
      if (res.data.success) {
        setEngineUsed(res.data.engine);
        setStats({
          highRiskCount: res.data.highRiskCount,
          mediumRiskCount: res.data.mediumRiskCount,
          lowRiskCount: res.data.lowRiskCount,
          total: res.data.totalAnalyzed,
        });
        setPredictions(res.data.predictions);
      }
    } catch (err) {
      alert('AI Prediction failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setPredicting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">
              AI Late Fee Defaulter Predictor
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-extrabold uppercase border border-purple-200">
              FastAPI ML Service
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Machine learning pipeline forecasting next-month default risks before fee loss occurs
          </p>
        </div>

        <button
          onClick={handleRunAI}
          disabled={predicting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-md shadow-purple-500/20 transition-all disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {predicting ? 'Computing AI Features...' : 'Run Prediction Engine'}
        </button>
      </div>

      {/* Model Info Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-rose-600">
            <ShieldAlert className="w-5 h-5" />
            <h4 className="font-bold text-sm text-slate-800">High Risk Threshold</h4>
          </div>
          <p className="text-2xl font-black text-rose-600">
            {stats ? stats.highRiskCount : predictions.filter((p) => (p.aiRiskLevel || p.risk_level) === 'High').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Students scoring &ge; 65% delay probability</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-amber-500">
            <AlertTriangle className="w-5 h-5" />
            <h4 className="font-bold text-sm text-slate-800">Moderate Risk</h4>
          </div>
          <p className="text-2xl font-black text-amber-500">
            {stats ? stats.mediumRiskCount : predictions.filter((p) => (p.aiRiskLevel || p.risk_level) === 'Medium').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Students with 38% - 64% delay probability</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            <h4 className="font-bold text-sm text-slate-800">Low Risk / Disciplined</h4>
          </div>
          <p className="text-2xl font-black text-emerald-600">
            {stats ? stats.lowRiskCount : predictions.filter((p) => (p.aiRiskLevel || p.risk_level) === 'Low').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Consistent on-time payment track record</p>
        </div>
      </div>

      {engineUsed && (
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-purple-600" />
            Inference Engine: <strong>{engineUsed}</strong>
          </span>
          <span className="text-[11px] text-purple-600">Real-time behavior scoring active</span>
        </div>
      )}

      {/* Predictions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Next-Month Student Risk Assessment</h3>
          <span className="text-xs text-slate-400">Ranked by risk severity</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : predictions.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No predictions yet</p>
            <p className="text-xs text-slate-400">Click "Run Prediction Engine" to analyze historical payment behavior.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 uppercase tracking-wider font-bold">
                  <th className="py-3 px-4">Student & Seat</th>
                  <th className="py-3 px-4">Risk Probability</th>
                  <th className="py-3 px-4">Risk Level</th>
                  <th className="py-3 px-4">Key Behavioral Factors</th>
                  <th className="py-3 px-4">Recommended Next Step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {predictions.map((p, idx) => {
                  const score = p.risk_score || p.aiRiskScore || 20;
                  const level = p.risk_level || p.aiRiskLevel || 'Low';
                  const reason = p.prediction_reason || p.aiPredictionReason || 'Normal';
                  const action = p.recommended_action || 'Standard reminder 3 days prior';
                  const name = p.student_name || p.studentName;
                  const seat = p.seat_number || p.seatNumber;

                  return (
                    <tr key={p.student_id || p._id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-800 text-sm">{name}</p>
                        <p className="text-[11px] text-indigo-600 font-semibold flex items-center gap-1 mt-0.5">
                          <Armchair className="w-3 h-3" /> Seat {formatSeatNumber(seat)}
                        </p>
                      </td>

                      <td className="py-3 px-4">
                        <div className="w-28">
                          <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                            <span className={level === 'High' ? 'text-rose-600' : level === 'Medium' ? 'text-amber-600' : 'text-emerald-600'}>
                              {score}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                level === 'High' ? 'bg-rose-500' : level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${score}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            level === 'High'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : level === 'Medium'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {level}
                        </span>
                      </td>

                      <td className="py-3 px-4 max-w-xs text-slate-600">
                        {reason}
                      </td>

                      <td className="py-3 px-4 max-w-xs text-slate-700 font-medium">
                        {action}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
