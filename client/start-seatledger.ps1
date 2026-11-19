# Robust Launcher for SeatLedger Multi-Tenant SaaS
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# If called from a subfolder or directly
if (Test-Path "$ScriptDir\server") {
    $RootDir = $ScriptDir
} elseif (Test-Path "$ScriptDir\..\server") {
    $RootDir = Resolve-Path "$ScriptDir\.."
} else {
    $RootDir = "C:\Users\AJIT KUMAR YADAV\OneDrive\Desktop\SeatLedger"
}

Set-Location $RootDir
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚀 Launching SeatLedger Multi-Tenant Library SaaS" -ForegroundColor Yellow
Write-Host "   Working Directory: $RootDir" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start Python FastAPI AI Microservice in separate background window
Write-Host "[1/3] Starting AI Defaulter Predictor (FastAPI on Port 8000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir'; .\.venv\Scripts\Activate.ps1; python ai-service/main.py"

Start-Sleep -Seconds 2

# 2. Start Node.js Express Server in separate window
Write-Host "[2/3] Starting Backend API Server (Node.js on Port 5000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/server'; npm run dev"

Start-Sleep -Seconds 2

# 3. Start Vite React Client in separate window
Write-Host "[3/3] Starting Client Frontend (Vite on Port 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir/client'; npm run dev"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "✨ All 3 SeatLedger Services are running!" -ForegroundColor Green
Write-Host "🌐 Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "📡 Backend:  http://localhost:5000" -ForegroundColor Yellow
Write-Host "🧠 AI Micro: http://localhost:8000" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
