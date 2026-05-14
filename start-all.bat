@echo off
:: GuardianDApp One-Click Startup Script (ASCII Version)
chcp 65001 > nul

echo ==========================================
echo   GuardianDApp Desktop Software Launcher
echo ==========================================

:: 1. Start Hardhat Node
echo [1/4] Starting Blockchain Node...
start "Hardhat Node" cmd /c "npm run node"

:: Wait for node
echo Waiting for node to initialize (5s)...
ping 127.0.0.1 -n 6 > nul

:: 2. Deploy Contracts
echo [2/4] Deploying Smart Contracts...
call npm run deploy
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Deployment failed!
    pause
    exit /b %ERRORLEVEL%
)

:: 3. Start Bank API
echo [3/4] Starting Bank Core API...
start "Bank API" cmd /c "npm run mock:start"

:: 4. Start Electron App
echo [4/4] Starting Desktop UI...
:: Start Vite in background
start "Vite Dev" cmd /c "npm run dev"
echo Waiting for UI server...
ping 127.0.0.1 -n 5 > nul

:: Launch Electron Window
echo Launching Electron...
call npm run app

echo ==========================================
echo   System is running!
echo ==========================================
pause
