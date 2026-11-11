@echo off
setlocal
cd /d "%~dp0"
title THE UNFINISHED PORTRAIT
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer from https://nodejs.org/ then run this file again.
  echo To try the offline sample now, use start-demo-windows.bat.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies for this computer...
  call npm.cmd ci
  if errorlevel 1 (
    echo Installation failed. Check the message above and your connection.
    pause
    exit /b 1
  )
)
echo Open http://localhost:5174 after the service is ready.
echo Configure .env from .env.example for real AI. Keep this window open.
call npm.cmd start
pause
