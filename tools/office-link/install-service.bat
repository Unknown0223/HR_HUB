@echo off
REM HR HUB Link — Windows Service o'rnatish (GW + tunnel)
REM ADMIN huquqi bilan ishga tushiring.
REM Avval: GUI «Ulash» muvaffaqiyatli (data\service.json yoziladi).
setlocal EnableExtensions
cd /d "%~dp0"

echo === HR HUB Link — Service o'rnatish ===
echo Papka: %CD%
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [XATO] Administrator huquqi kerak.
  echo O'ng tugma → «Run as administrator».
  pause
  exit /b 1
)

if not exist "%CD%\data\service.json" (
  echo [OGOHLANTIRISH] data\service.json yo'q.
  echo Avval GUI da «Ulash» ni bajarhing yoki service.json ni qo'lda yarating.
  echo Davom etamiz — worker config.json + link.key ni o'qiydi.
  echo.
)

set "SVC_NAME=HRHUB-OfficeLink"
set "PYTHONW="
where pythonw >nul 2>&1 && set "PYTHONW=pythonw"
if not defined PYTHONW (
  where python >nul 2>&1 && set "PYTHONW=python"
)
if not defined PYTHONW (
  if exist "%CD%\runtime\python\pythonw.exe" set "PYTHONW=%CD%\runtime\python\pythonw.exe"
)
if not defined PYTHONW (
  if exist "%CD%\runtime\python\python.exe" set "PYTHONW=%CD%\runtime\python\python.exe"
)
if not defined PYTHONW (
  echo [XATO] pythonw/python topilmadi.
  echo Python o'rnating yoki avval GUI «Ulash» / ensure_runtime ishga tushiring.
  pause
  exit /b 1
)

set "WORKER=%CD%\service_worker.py"
if not exist "%WORKER%" (
  echo [XATO] service_worker.py topilmadi: %WORKER%
  pause
  exit /b 1
)

REM --- NSSM (tavsiya) ---
set "NSSM="
if exist "%CD%\nssm.exe" set "NSSM=%CD%\nssm.exe"
if not defined NSSM if exist "%CD%\tools\nssm.exe" set "NSSM=%CD%\tools\nssm.exe"
if not defined NSSM (
  where nssm >nul 2>&1 && for /f "delims=" %%I in ('where nssm') do set "NSSM=%%I" & goto :have_nssm
)
:have_nssm
if defined NSSM (
  echo NSSM topildi: %NSSM%
  "%NSSM%" stop "%SVC_NAME%" >nul 2>&1
  "%NSSM%" remove "%SVC_NAME%" confirm >nul 2>&1
  "%NSSM%" install "%SVC_NAME%" "%PYTHONW%" "%WORKER%"
  if errorlevel 1 (
    echo [XATO] NSSM install muvaffaqiyatsiz.
    goto :fallback_hint
  )
  "%NSSM%" set "%SVC_NAME%" AppDirectory "%CD%"
  "%NSSM%" set "%SVC_NAME%" DisplayName "HR HUB Office Link"
  "%NSSM%" set "%SVC_NAME%" Description "Device gateway + Cloudflare tunnel (office-link)"
  "%NSSM%" set "%SVC_NAME%" Start SERVICE_AUTO_START
  "%NSSM%" set "%SVC_NAME%" AppRestartDelay 5000
  "%NSSM%" start "%SVC_NAME%"
  echo.
  echo [OK] Service o'rnatildi va ishga tushirildi: %SVC_NAME%
  echo Holat: data\service_status.json
  echo Yo'riqnoma: SERVICE.txt
  pause
  exit /b 0
)

REM --- sc.exe + pythonw (NSSM yo'q) ---
echo NSSM topilmadi — sc.exe bilan urinilmoqda...
echo Eslatma: sc.exe Python skriptini to'g'ridan-to'g'ri yomon ushlaydi.
echo Tavsiya: https://nssm.cc dan nssm.exe ni shu papkaga qo'ying.
echo.

sc stop "%SVC_NAME%" >nul 2>&1
sc delete "%SVC_NAME%" >nul 2>&1
sc create "%SVC_NAME%" binPath= "\"%PYTHONW%\" \"%WORKER%\"" start= auto DisplayName= "HR HUB Office Link"
if errorlevel 1 (
  echo [XATO] sc create muvaffaqiyatsiz.
  goto :fallback_hint
)
sc description "%SVC_NAME%" "Device gateway + Cloudflare tunnel (office-link)" >nul 2>&1
sc start "%SVC_NAME%"
if errorlevel 1 (
  echo [OGOHLANTIRISH] Service yaratildi, lekin start xato berdi.
  echo Muqobil: Task Scheduler ^(pastda^).
) else (
  echo [OK] Service yaratildi: %SVC_NAME%
)
echo Holat: data\service_status.json
pause
exit /b 0

:fallback_hint
echo.
echo === Muqobil: Task Scheduler ===
echo 1^) taskschd.msc oching
echo 2^) Create Basic Task → «HRHUB-OfficeLink»
echo 3^) Trigger: At startup ^(yoki At log on^)
echo 4^) Action: Start a program
echo      Program: %PYTHONW%
echo      Arguments: "%WORKER%"
echo      Start in: %CD%
echo 5^) Run with highest privileges
echo.
echo Yoki qo'lda: "%PYTHONW%" "%WORKER%"
echo Batafsil: SERVICE.txt
pause
exit /b 1
