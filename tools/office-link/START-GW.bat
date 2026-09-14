@echo off
REM HR HUB Link — GW + Cloudflare tunnel (headless). Keep this window open.
setlocal EnableExtensions
cd /d "%~dp0"

echo === HR HUB Office Link — gateway + tunnel ===
echo Papka: %CD%
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [XATO] python topilmadi. Python 3 o'rnating yoki PATH ga qo'shing.
  pause
  exit /b 1
)

if not exist "%CD%\data\link.key" (
  echo [OGOHLANTIRISH] data\link.key yo'q.
  echo Avval GUI «Ulash» (BOSHLASH.bat / HRHUB-Qurilma.exe) ni bir marta bajaring.
  echo.
)

echo GW + tunnel ishga tushmoqda. Oyna ochiq tursin.
echo Holat: data\service_status.json
echo.
python "%CD%\service_worker.py"
echo.
echo Worker to'xtadi. Qayta ishga tushirish uchun shu bat ni yana oching.
pause
exit /b %ERRORLEVEL%
