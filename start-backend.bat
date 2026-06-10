@echo off
echo Starting Backend Services...

echo [1/4] Starting Hardhat Node...
start "Hardhat Node" cmd /k "npm run node"

echo Waiting 5 seconds for node to initialize...
timeout /t 5 /nobreak >nul

echo [2/4] Deploying Contracts...
call npm run deploy
echo Contract deployment finished!

echo [3/4] Starting Mock Server...
start "Mock Server" cmd /k "npm run mock:start"

echo [4/4] Starting Vite Server...
start "Vite Server" cmd /k "npm run dev"

echo ===================================================
echo All backend services have been started!
echo Please keep the 3 new black command windows open.
echo.
echo Now you can open new terminals to start the frontend:
echo 1. Ward App:     npm run app:ward
echo 2. Guardian App: npm run app:guardian
echo ===================================================
pause
