@echo off
rem Builds the unsigned Squirrel.Windows installers for Map Editor and Map Editor Deploy.
rem The installers are not code-signed; Windows SmartScreen may warn before they run.
setlocal
cd /d "%~dp0"
call build.bat %* || exit /b %errorlevel%
call node scripts\package-desktop.mjs || exit /b %errorlevel%
for /r out\installers %%f in (*.exe *.nupkg RELEASES) do (
  for /f "skip=1 tokens=*" %%h in ('certutil -hashfile "%%f" SHA256 ^| findstr /v ":"') do echo %%h  %%f
)
exit /b 0
