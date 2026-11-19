@echo off
title SeatLedger Multi-Tenant SaaS
set "ROOT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%start-seatledger.ps1"
if errorlevel 1 (
    echo SeatLedger startup encountered an error.
    pause
)
