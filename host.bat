@echo off
setlocal
rem One-click hosting for the Map Editor web app.
rem   host.bat            choose a mode
rem   host.bat --detached start in the background and print the link
rem   host.bat --logs     start and follow the live log (Ctrl+C to stop following)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js was not found. Run download-dependencies.bat first. & exit /b 3)
set MODE=%1
if "%MODE%"=="" (
  echo Map Editor hosting
  echo   1. Start in the background
  echo   2. Start and show the live log
  choice /c 12 /n /m "Choose 1 or 2: "
  if errorlevel 2 (set MODE=--logs) else (set MODE=--detached)
)
if not exist ".env" (
  node scripts\setup.mjs || exit /b %errorlevel%
) else (
  node scripts\setup.mjs --yes || exit /b %errorlevel%
)
if /i "%MODE%"=="--logs" docker compose logs -f --tail 200
exit /b %errorlevel%
