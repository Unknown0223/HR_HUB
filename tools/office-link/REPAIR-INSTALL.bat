@echo off
REM Buzilgan Program Files\HRHUB-Link .py fayllarini repo/nusxadan tiklash (ADMIN).
setlocal EnableExtensions
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo [XATO] Administrator huquqi kerak.
  echo O'ng tugma → «Run as administrator».
  pause
  exit /b 1
)

set "DST=C:\Program Files\HRHUB-Link"
if not exist "%DST%\BOSHLASH.bat" (
  echo [XATO] O'rnatish topilmadi: %DST%
  pause
  exit /b 1
)

echo === Repair: %DST% ===
for %%F in (
  service_worker.py tunnel_watch.py runtime_setup.py session.py api_client.py
  paths.py provision.py discovery.py credential_store.py office_link_gui.py
  office_link_app.py office_link_run.py passwords.py auth_lock.py device_email.py
  device_security.py bulk_provision.py
) do (
  if exist "%CD%\%%F" (
    copy /Y "%CD%\%%F" "%DST%\%%F" >nul
    echo OK %%F
  ) else (
    echo SKIP %%F ^(yo'q^)
  )
)

if exist "%CD%\START-GW.bat" copy /Y "%CD%\START-GW.bat" "%DST%\START-GW.bat" >nul

echo.
echo [OK] Asosiy skriptlar tiklandi.
echo Keyin: START-GW.bat yoki install-service.bat (ADMIN).
pause
exit /b 0
