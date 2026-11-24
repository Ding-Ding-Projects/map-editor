@echo off
rem Installs anything the build needs that is missing, using Chocolatey, then refreshes PATH.
rem Silent: download-dependencies.bat /s
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-dependencies.ps1" %*
exit /b %errorlevel%
