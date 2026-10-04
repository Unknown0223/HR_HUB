@echo off
REM Worklyn Link — GW + Cloudflare tunnel (headless). Keep this window open.
setlocal EnableExtensions
cd /d "%~dp0"

echo === Worklyn Office Link — gateway + tunnel ===
echo Papka: %CD%
echo.

set "PY=%CD%\runtime\python\python.exe"
if not exist "%PY%" (
  where python >nul 2>&1 || (
    echo [XATO] runtime\python topilmadi. Worklyn Link'ni qayta o'rnating.
    pause
    exit /b 1
  )
  set "PY=python"
)

if not exist "%CD%\data\link.key" (
  echo [OGOHLANTIRISH] data\link.key yo'q.
  echo Avval GUI «Ulash» (BOSHLASH.bat) ni bir marta bajaring.
  echo.
)

echo GW + tunnel ishga tushmoqda. Oyna ochiq tursin.
echo Holat: data\service_status.json
echo.
"%PY%" "%CD%\service_worker.py"
echo.
echo Worker to'xtadi. Qayta ishga tushirish uchun shu bat ni yana oching.
pause
exit /b %ERRORLEVEL%
