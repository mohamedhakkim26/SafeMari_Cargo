@echo off
echo Starting SafeMari Cargo Tools...
echo.

cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    npm install
    echo.
)

echo Starting application...
npm start