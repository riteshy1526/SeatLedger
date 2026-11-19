const express = require('express');
const axios = require('axios');
const Student = require('../models/Student');
const FeePayment = require('../models/FeePayment');
const { authenticate } = require('../middleware/auth');
const { tenantContext } = require('../middleware/tenant');
const { requireRoles } = require('../middleware/roles');

const router = express.Router();
router.use(authenticate, tenantContext);

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Predict fee defaulters for next month
 * Sends student payment history to FastAPI microservice
 */
router.post('/predict-all', requireRoles('admin', 'staff'), async (req, res) => {
  try {
    const students = await Student.find({ libraryId: req.libraryId, status: 'Active' });
    if (students.length === 0) {
      return res.json({ success: true, count: 0, predictions: [] });
    }

    // Prepare feature payloads for each student based on historical fee payments
    const studentPayloads = [];

    for (const student of students) {
      const pastFees = await FeePayment.find({
        studentId: student._id,
        libraryId: req.libraryId,
      }).sort({ year: -1, month: -1 }).limit(6);

      const totalPastFees = pastFees.length;
      let lateCount = 0;
      let partialCount = 0;
      let dueCount = 0;
      let totalDelayDays = 0;

      pastFees.forEach((f) => {
        if (f.status === 'Due') dueCount++;
        if (f.status === 'Partial') partialCount++;
        if (f.paymentDate && f.dueDate && f.paymentDate > f.dueDate) {
          lateCount++;
          const diffDays = Math.ceil((f.paymentDate - f.dueDate) / (1000 * 60 * 60 * 24));
          totalDelayDays += Math.max(0, diffDays);
        }
      });

      const joiningMonthsAgo = Math.max(
        1,
        Math.floor((Date.now() - new Date(student.joiningDate)) / (1000 * 60 * 60 * 24 * 30))
      );

      studentPayloads.push({
        student_id: student._id.toString(),
        student_name: student.studentName,
        seat_number: student.seatNumber,
        contact_no: student.contactNo,
        monthly_fee: student.monthlyFee,
        shift: student.shift,
        tenure_months: joiningMonthsAgo,
        total_past_records: totalPastFees,
        past_due_count: dueCount,
        past_partial_count: partialCount,
        past_late_payments: lateCount,
        average_delay_days: lateCount > 0 ? Math.round(totalDelayDays / lateCount) : 0,
      });
    }

    let predictions = [];
    let engineUsed = 'FastAPI Microservice';

    // 1. Try calling the FastAPI microservice
    try {
      const response = await axios.post(`${AI_SERVICE_URL}/predict-defaulters`, {
        students: studentPayloads,
      }, { timeout: 3500 });

      if (response.data && response.data.predictions) {
        predictions = response.data.predictions;
      }
    } catch (aiErr) {
      console.warn(`[AI Route] FastAPI microservice unavailable at ${AI_SERVICE_URL}. Using fallback prediction heuristic:`, aiErr.message);
      engineUsed = 'Built-in Machine Learning Heuristic Engine';

      // Fallback heuristic scoring
      predictions = studentPayloads.map((st) => {
        let score = 15; // baseline

        // Factors
        if (st.past_due_count > 0) score += st.past_due_count * 28;
        if (st.past_partial_count > 0) score += st.past_partial_count * 15;
        if (st.past_late_payments > 0) score += st.past_late_payments * 14;
        if (st.average_delay_days > 5) score += Math.min(25, st.average_delay_days * 2);
        if (st.tenure_months < 2) score += 10; // newer students have higher variance
        if (st.monthly_fee > 1200) score += 8;

        score = Math.min(96, Math.max(8, score));

        let riskLevel = 'Low';
        let reason = 'Consistently pays fee on time; minimal default risk.';
        let recommendedAction = 'No action needed. Standard reminder 3 days before due date.';

        if (score >= 65) {
          riskLevel = 'High';
          reason = `High delay history (${st.past_late_payments} late payments, ${st.past_due_count} unresolved dues).`;
          recommendedAction = 'Send proactive WhatsApp fee reminder early and schedule personal desk follow-up.';
        } else if (score >= 40) {
          riskLevel = 'Medium';
          reason = `Occasional payment delays (avg ${st.average_delay_days} days) or partial payments.`;
          recommendedAction = 'Send automated WhatsApp & Email notification 3 days prior.';
        }

        return {
          student_id: st.student_id,
          student_name: st.student_name,
          seat_number: st.seat_number,
          contact_no: st.contact_no,
          monthly_fee: st.monthly_fee,
          risk_score: score,
          risk_level: riskLevel,
          prediction_reason: reason,
          recommended_action: recommendedAction,
          probability_percentage: `${score}%`,
        };
      });
    }

    // Save predictions to Student documents
    for (const pred of predictions) {
      await Student.findByIdAndUpdate(pred.student_id, {
        aiRiskScore: pred.risk_score,
        aiRiskLevel: pred.risk_level,
        aiPredictionReason: pred.prediction_reason,
        lastPredictedAt: new Date(),
      });
    }

    // Sort descending by risk score
    predictions.sort((a, b) => b.risk_score - a.risk_score);

    return res.json({
      success: true,
      engine: engineUsed,
      totalAnalyzed: predictions.length,
      highRiskCount: predictions.filter((p) => p.risk_level === 'High').length,
      mediumRiskCount: predictions.filter((p) => p.risk_level === 'Medium').length,
      lowRiskCount: predictions.filter((p) => p.risk_level === 'Low').length,
      predictions,
    });
  } catch (err) {
    console.error('AI Prediction error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get AI Defaulters List
 */
router.get('/defaulters-summary', async (req, res) => {
  try {
    const students = await Student.find({
      libraryId: req.libraryId,
      status: 'Active',
      aiRiskScore: { $ne: null },
    }).sort({ aiRiskScore: -1 });

    return res.json({ success: true, count: students.length, defaulters: students });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
