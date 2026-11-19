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
Write-Host "   Launching SeatLedger Multi-Tenant Library SaaS" -ForegroundColor Yellow
Write-Host "   Working Directory: $RootDir" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Node.js Express API is running
$BackendReady = $false
try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/health" -TimeoutSec 2
    $BackendReady = $Health.status -eq "healthy"
} catch {
}

if ($BackendReady) {
    Write-Host "[1/3] Backend API is already running." -ForegroundColor Green
} else {
    Write-Host "[1/3] Starting Backend API Server (Node.js on Port 5000)..." -ForegroundColor Green
    Start-Process -FilePath $env:ComSpec -ArgumentList @("/k", "npm run dev") -WorkingDirectory (Join-Path $RootDir "server")
    Write-Host "Waiting for the backend API to become ready..." -ForegroundColor Gray
}

for ($Attempt = 1; -not $BackendReady -and $Attempt -le 60; $Attempt++) {
    try {
        $Health = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/health" -TimeoutSec 1
        if ($Health.status -eq "healthy") {
            $BackendReady = $true
            break
        }
    } catch {
    }
    if (-not $BackendReady -and $Attempt -lt 60) {
        Start-Sleep -Seconds 1
    }
}

if ($BackendReady) {
    Write-Host "Backend API is ready at http://localhost:5000." -ForegroundColor Green
} else {
    Write-Warning "Backend API did not become ready after 60 seconds. Check the backend window."
}

# 2. Ensure the FastAPI AI service is running
$PythonExe = Join-Path $RootDir ".venv\Scripts\python.exe"
if (Test-Path $PythonExe) {
    $AiReady = $false
    try {
        $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 2
        $AiReady = $Health.status -eq "online"
    } catch {
    }

    if ($AiReady) {
        Write-Host "[2/3] AI API is already running." -ForegroundColor Green
    } else {
        Write-Host "[2/3] Starting AI API (FastAPI on Port 8000)..." -ForegroundColor Green
        Start-Process -FilePath $env:ComSpec -ArgumentList @("/k", "`"$PythonExe`" main.py") -WorkingDirectory (Join-Path $RootDir "ai-service")
        Write-Host "Waiting for the AI API to become ready..." -ForegroundColor Gray
    }

    for ($Attempt = 1; -not $AiReady -and $Attempt -le 30; $Attempt++) {
        try {
            $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/" -TimeoutSec 1
            if ($Health.status -eq "online") {
                $AiReady = $true
                break
            }
        } catch {
        }
        if (-not $AiReady -and $Attempt -lt 30) {
            Start-Sleep -Seconds 1
        }
    }

    if ($AiReady) {
        Write-Host "AI API is ready at http://localhost:8000." -ForegroundColor Green
    } else {
        Write-Warning "AI API did not become ready after 30 seconds. Check its window."
    }
} else {
    Write-Warning "Python environment not found at $PythonExe. Start the AI API manually or create the project .venv."
}

# 3. Ensure Vite React Client is running
$FrontendReady = $false
try {
    $Response = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 2
    $FrontendReady = $Response.StatusCode -eq 200
} catch {
}

if ($FrontendReady) {
    Write-Host "[3/3] Frontend is already running." -ForegroundColor Green
} else {
    Write-Host "[3/3] Starting Client Frontend (Vite on Port 5173)..." -ForegroundColor Green
    Start-Process -FilePath $env:ComSpec -ArgumentList @("/k", "npm run dev -- --host 127.0.0.1 --port 5173") -WorkingDirectory (Join-Path $RootDir "client")
}

for ($Attempt = 1; -not $FrontendReady -and $Attempt -le 30; $Attempt++) {
    try {
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 1
        $FrontendReady = $Response.StatusCode -eq 200
    } catch {
    }
    if (-not $FrontendReady -and $Attempt -lt 30) {
        Start-Sleep -Seconds 1
    }
}

if ($FrontendReady) {
    Write-Host "Frontend is ready at http://localhost:5173." -ForegroundColor Green
    Start-Process "http://localhost:5173"
} else {
    Write-Warning "Frontend did not become ready after 30 seconds. Check the frontend window."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "SeatLedger startup complete." -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Yellow
Write-Host "AI API:   http://localhost:8000" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
