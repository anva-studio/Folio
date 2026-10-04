@echo off
setlocal
cd /d "%~dp0"
echo.
echo   FOLIO by ANVA - production preview
echo   Starting at http://127.0.0.1:4173
echo   Press Ctrl+C to stop.
echo.
call npm.cmd run build
if errorlevel 1 exit /b 1
call npm.cmd run preview
endlocal

