@echo off
title SHIPMATE Setup
color 1F
echo.
echo  ================================================
echo   SHIPMATE - Shipcube Team OS
echo   Setting up your development environment...
echo  ================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found. Please install from https://nodejs.org
    pause
    exit /b 1
)
echo  Node.js found:
node --version

echo.
echo [2/3] Installing dependencies (this takes 1-2 minutes)...
call npm install
if %errorlevel% neq 0 (
    echo  ERROR: npm install failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [3/3] Starting development server...
echo.
echo  ================================================
echo   App running at: http://localhost:3000
echo.
echo   IMPORTANT: Before logging in, fill in your
echo   Firebase keys in the .env.local file!
echo  ================================================
echo.
call npm run dev
pause
