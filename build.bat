@echo off
rem Builds Map Editor from a fresh Windows machine.
rem   build.bat          build (installs missing tools first, may show one admin prompt)
rem   build.bat --run    build, then start the desktop app
rem   build.bat /s       silent: never prompts; fails if tools are missing
setlocal
cd /d "%~dp0"
set SILENT=
set RUN=
for %%a in (%*) do (
  if /i "%%a"=="/s" set SILENT=/s
  if /i "%%a"=="--silent" set SILENT=/s
  if /i "%%a"=="--run" set RUN=1
  if /i "%%a"=="/run" set RUN=1
)
call download-dependencies.bat %SILENT% || exit /b %errorlevel%
call npm ci --no-audit --no-fund || exit /b %errorlevel%
call node scripts\build.mjs || exit /b %errorlevel%
echo Built dist\desktop\main.cjs and dist\server\server.mjs
if defined RUN call npx electron . || exit /b %errorlevel%
exit /b 0
