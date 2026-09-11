@echo off
REM To'liq ofis paketi: EXE + .bat + buyruqlar → release\HRHUB-Link\
REM Avval BUILD-EXE.bat (yoki PyInstaller) kerak.
setlocal EnableExtensions
cd /d "%~dp0"

echo === HR HUB Link — release paket ===
set "DIST=%CD%\dist\HRHUB-Qurilma"
set "REL=%CD%\release\HRHUB-Link"
set "ZIP=%CD%\release\HRHUB-Link-portable.zip"

if not exist "%DIST%\HRHUB-Qurilma.exe" (
  echo [XATO] EXE yo'q: %DIST%\HRHUB-Qurilma.exe
  echo Avval BUILD-EXE.bat ni ishga tushiring.
  if not defined NOPAUSE pause
  exit /b 1
)

if exist "%REL%" rmdir /S /Q "%REL%"
mkdir "%REL%"
mkdir "%REL%\ilova"
mkdir "%REL%\buyruqlar"
if not exist "%CD%\release" mkdir "%CD%\release"

echo EXE nusxalanmoqda...
xcopy /E /I /Y "%DIST%\*" "%REL%\ilova\" >nul
if exist "%CD%\hrhub-link.ico" copy /Y "%CD%\hrhub-link.ico" "%REL%\ilova\" >nul
if exist "%CD%\hrhub-link-256.png" copy /Y "%CD%\hrhub-link-256.png" "%REL%\ilova\" >nul

echo Skriptlar...
copy /Y "%CD%\install-service.bat" "%REL%\" >nul
copy /Y "%CD%\uninstall-service.bat" "%REL%\" >nul
copy /Y "%CD%\ADMIN-PAROL.bat" "%REL%\" >nul
copy /Y "%CD%\SERVICE.txt" "%REL%\" >nul
copy /Y "%CD%\QOLLAMA.txt" "%REL%\" >nul
copy /Y "%CD%\config.json" "%REL%\" >nul
if exist "%CD%\hrhub-link.ico" copy /Y "%CD%\hrhub-link.ico" "%REL%\" >nul
if exist "%CD%\hrhub-link-256.png" copy /Y "%CD%\hrhub-link-256.png" "%REL%\" >nul
copy /Y "%CD%\link.ps1" "%REL%\" >nul
copy /Y "%CD%\service_worker.py" "%REL%\" >nul
copy /Y "%CD%\tunnel_watch.py" "%REL%\" >nul
copy /Y "%CD%\bulk_provision.py" "%REL%\" >nul
for %%F in (api_client.py auth_lock.py discovery.py passwords.py paths.py provision.py session.py runtime_setup.py tunnel_watch.py office_link_app.py office_link_gui.py office_link_run.py credential_store.py device_email.py device_security.py) do (
  if exist "%CD%\%%F" copy /Y "%CD%\%%F" "%REL%\" >nul
)

> "%REL%\BOSHLASH.bat" (
  echo @echo off
  echo REM HR HUB Link — ofis ilovasini ochish
  echo cd /d "%%~dp0"
  echo if exist "%%~dp0ilova\HRHUB-Qurilma.exe" ^(
  echo   start "" /D "%%~dp0ilova" "%%~dp0ilova\HRHUB-Qurilma.exe"
  echo   exit /b 0
  echo ^)
  echo echo HRHUB-Qurilma.exe topilmadi. ilova\ papkasini tekshiring.
  echo pause
  echo exit /b 1
)

> "%REL%\HRHUB-Qurilma.bat" (
  echo @echo off
  echo cd /d "%%~dp0"
  echo call "%%~dp0BOSHLASH.bat"
)

> "%REL%\buyruqlar\bulk-provision.bat" (
  echo @echo off
  echo cd /d "%%~dp0.."
  echo if "%%~1"=="" ^(
  echo   echo Foydalanish: buyruqlar\bulk-provision.bat --hosts IP1,IP2 --location ID --password PAROL
  echo   pause
  echo   exit /b 1
  echo ^)
  echo python "%%~dp0..\bulk_provision.py" %%*
  echo pause
)

> "%REL%\buyruqlar\service-status.bat" (
  echo @echo off
  echo cd /d "%%~dp0.."
  echo sc query HRHUB-OfficeLink 2^>nul
  echo if exist "%%CD%%\data\service_status.json" type "%%CD%%\data\service_status.json"
  echo if exist "%%CD%%\data\tunnel_url.txt" type "%%CD%%\data\tunnel_url.txt"
  echo pause
)

> "%REL%\buyruqlar\service-ornatish.bat" (
  echo @echo off
  echo cd /d "%%~dp0.."
  echo call "%%~dp0..\install-service.bat"
)

> "%REL%\buyruqlar\service-ochirish.bat" (
  echo @echo off
  echo cd /d "%%~dp0.."
  echo call "%%~dp0..\uninstall-service.bat"
)

> "%REL%\buyruqlar\admin-parol.bat" (
  echo @echo off
  echo cd /d "%%~dp0.."
  echo call "%%~dp0..\ADMIN-PAROL.bat"
)

> "%REL%\buyruqlar\tunnel-url.bat" (
  echo @echo off
  echo cd /d "%%~dp0.."
  echo if exist "%%CD%%\data\tunnel_url.txt" ^(type "%%CD%%\data\tunnel_url.txt"^) else echo Tunnel URL yo'q.
  echo pause
)

> "%REL%\OQISH.txt" (
  echo HR HUB Link — OFIS PAKETI
  echo ========================
  echo.
  echo 1^) BOSHLASH.bat — GUI ochish
  echo 2^) Web dan pairing token
  echo 3^) Ulash → install-service.bat ^(ADMIN^)
  echo.
  echo buyruqlar\ — service / bulk / tunnel yordamchi bat
  echo Batafsil: QOLLAMA.txt
)

echo ZIP...
if exist "%ZIP%" del /F /Q "%ZIP%"
REM Prefer Python zip (forward slashes) so API inject works reliably across platforms.
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%CD%\pack_zip.py" "%REL%" "%ZIP%"
) else (
  powershell -NoProfile -Command "Compress-Archive -Path '%REL%\*' -DestinationPath '%ZIP%' -Force"
)
if not exist "%ZIP%" (
  echo [XATO] ZIP yaratilmadi.
  if not defined NOPAUSE pause
  exit /b 1
)

echo.
echo [OK] Papka: %REL%
echo [OK] ZIP:   %ZIP%
echo Ofis PCga release\HRHUB-Link papkasini yoki ZIP ni bering.
if not defined NOPAUSE pause
exit /b 0
