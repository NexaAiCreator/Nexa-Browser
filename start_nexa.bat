@echo off
echo Starting Nexa AI Engine...
start cmd /k "C:\Nexa\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000"

echo Starting Nexa AI Gateway...
start cmd /k "cd /d C:\Nexa Broswer\backend && node server.js"

echo Launching Nexa Browser...
start cmd /k "cd /d C:\Nexa Broswer && npm start"

echo.
echo Sovereign Ecosystem is booting up...
echo Please wait for all three windows to stabilize.
pause
