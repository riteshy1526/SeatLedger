@echo off
title SeatLedger Multi-Tenant SaaS
set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

echo ==========================================================
echo    Launching SeatLedger Multi-Tenant Library SaaS
echo ==========================================================

echo [1/3] Starting AI Defaulter Predictor (Port 8000)...
start "SeatLedger - AI FastAPI (8000)" powershell -NoExit -Command "cd '%ROOT_DIR%'; .\.venv\Scripts\Activate.ps1; python ai-service/main.py"

timeout /t 2 /nobreak >nul

echo [2/3] Starting Backend Server (Port 5000)...
start "SeatLedger - Backend (5000)" powershell -NoExit -Command "cd '%ROOT_DIR%server'; npm run dev"

timeout /t 2 /nobreak >nul

echo [3/3] Starting Client Frontend (Port 5173)...
start "SeatLedger - Frontend (5173)" powershell -NoExit -Command "cd '%ROOT_DIR%client'; npm run dev"

echo ==========================================================
echo All services launched!
echo Open your browser at: http://localhost:5173
echo ==========================================================
pause
