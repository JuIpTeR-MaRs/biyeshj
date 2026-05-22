@echo off
:: GuardianDApp Shutdown Script
chcp 65001 > nul

echo ==========================================
echo   Stopping all GuardianDApp components...
echo ==========================================

:: 1. Close Electron processes
echo [1/4] Closing Electron applications...
taskkill /f /im electron.exe 2>nul

:: 2. Close Vite dev server (Port: 5173)
echo [2/4] Stopping Vite Dev Server (Port: 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do (
    taskkill /f /pid %%a 2>nul
)

:: 3. Close Mock Bank API (Port: 3000)
echo [3/4] Stopping Mock Bank API (Port: 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /f /pid %%a 2>nul
)

:: 4. Close Hardhat Node (Port: 8545)
echo [4/4] Stopping Hardhat Node (Port: 8545)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8545') do (
    taskkill /f /pid %%a 2>nul
)

echo ==========================================
echo   All components stopped successfully!
echo ==========================================
timeout /t 3
