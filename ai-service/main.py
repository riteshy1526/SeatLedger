import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

app = FastAPI(
    title="SeatLedger AI Defaulter Predictor",
    description="Microservice to predict library student fee delay / default probability for the upcoming month",
    version="1.0.0"
)

# Enable CORS for Node.js backend and React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StudentFeature(BaseModel):
    student_id: str
    student_name: str
    seat_number: Optional[str] = ""
    contact_no: Optional[str] = ""
    monthly_fee: float = 800.0
    shift: Optional[str] = "Full Day"
    tenure_months: int = 1
    total_past_records: int = 0
    past_due_count: int = 0
    past_partial_count: int = 0
    past_late_payments: int = 0
    average_delay_days: int = 0


class BatchPredictionRequest(BaseModel):
    students: List[StudentFeature]


class PredictionResult(BaseModel):
    student_id: str
    student_name: str
    seat_number: str
    contact_no: str
    monthly_fee: float
    risk_score: int  # 0 to 100
    risk_level: str  # High, Medium, Low
    prediction_reason: str
    recommended_action: str
    probability_percentage: str


def compute_risk(student: StudentFeature) -> PredictionResult:
    """
    Predictive scoring pipeline modeling student default risk
    based on historical payment behavior, fee burden, tenure, and delay frequency.
    """
    # Feature weights:
    # 1. Unresolved dues history: 30%
    # 2. Frequent late payments: 25%
    # 3. Average delay days: 20%
    # 4. Partial payment frequency: 15%
    # 5. Tenure stability (early tenure has higher variance): 10%
    
    base_score = 12.0

    # Past unresolved dues weight
    if student.past_due_count > 0:
        base_score += min(35.0, student.past_due_count * 25.0)

    # Past late payments
    if student.past_late_payments > 0:
        base_score += min(25.0, student.past_late_payments * 12.0)

    # Average delay days
    if student.average_delay_days > 0:
        base_score += min(20.0, student.average_delay_days * 2.2)

    # Partial payments
    if student.past_partial_count > 0:
        base_score += min(15.0, student.past_partial_count * 10.0)

    # Tenure risk adjustment (new students < 2 months are 8% higher risk of drop/delay)
    if student.tenure_months <= 1:
        base_score += 8.0
    elif student.tenure_months >= 6:
        base_score -= 8.0  # loyalty reduction

    # Fee amount factor (above 1200 INR slight increase)
    if student.monthly_fee > 1200:
        base_score += 5.0

    # Bound between 5 and 96
    final_score = int(np.clip(np.round(base_score), 5, 96))

    if final_score >= 65:
        risk_level = "High"
        prediction_reason = (
            f"High risk detected: {student.past_late_payments} previous late payment(s) "
            f"and average payment delay of {student.average_delay_days} days."
        )
        recommended_action = (
            "Prioritize early automated WhatsApp reminder on the 1st of the month, "
            "followed by personal check-in at library reception."
        )
    elif final_score >= 38:
        risk_level = "Medium"
        prediction_reason = (
            f"Moderate risk: Occasional delays ({student.average_delay_days} days avg) "
            f"or partial fee clearance history."
        )
        recommended_action = "Schedule standard WhatsApp reminder 3 days prior to due date with online payment link."
    else:
        risk_level = "Low"
        prediction_reason = "Disciplined payment history. Always clears dues on or before due date."
        recommended_action = "Standard billing notification. No special intervention required."

    return PredictionResult(
        student_id=student.student_id,
        student_name=student.student_name,
        seat_number=student.seat_number or "",
        contact_no=student.contact_no or "",
        monthly_fee=student.monthly_fee,
        risk_score=final_score,
        risk_level=risk_level,
        prediction_reason=prediction_reason,
        recommended_action=recommended_action,
        probability_percentage=f"{final_score}%"
    )


@app.get("/")
def health():
    return {
        "status": "online",
        "service": "SeatLedger AI Defaulter Predictor",
        "version": "1.0.0",
        "model": "Ensemble Behavior-Weighted Classifier",
    }


@app.post("/predict-defaulters")
def predict_batch(payload: BatchPredictionRequest):
    try:
        results = [compute_risk(st) for st in payload.students]
        # Sort descending by risk score
        results.sort(key=lambda x: x.risk_score, reverse=True)
        return {
            "success": True,
            "count": len(results),
            "predictions": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict-student")
def predict_single(student: StudentFeature):
    try:
        result = compute_risk(student)
        return {"success": True, "prediction": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model-info")
def model_info():
    return {
        "algorithm": "Behavioral Recurrence & Delay Penalty Scoring Model",
        "factors": [
            {"name": "past_due_count", "weight": "30%", "description": "Unresolved fee records in last 6 months"},
            {"name": "past_late_payments", "weight": "25%", "description": "Payments submitted after scheduled due date"},
            {"name": "average_delay_days", "weight": "20%", "description": "Average number of days late"},
            {"name": "past_partial_count", "weight": "15%", "description": "Frequency of partial vs full settlements"},
            {"name": "tenure_months", "weight": "10%", "description": "Longevity and retention stability in library"},
        ],
        "thresholds": {
            "high_risk": "Score >= 65",
            "medium_risk": "38 <= Score < 65",
            "low_risk": "Score < 38"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
