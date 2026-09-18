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

echo Gateway (device-gw) paketga...
set "GW_SRC=%CD%\..\..\apps\device-gw"
if not exist "%GW_SRC%\main.py" set "GW_SRC=%CD%\gw"
if exist "%GW_SRC%\main.py" (
  mkdir "%REL%\gw" 2>nul
  mkdir "%REL%\gw\adapters" 2>nul
  mkdir "%REL%\ilova\gw" 2>nul
  mkdir "%REL%\ilova\gw\adapters" 2>nul
  copy /Y "%GW_SRC%\main.py" "%REL%\gw\" >nul
  copy /Y "%GW_SRC%\main.py" "%REL%\ilova\gw\" >nul
  if exist "%GW_SRC%\nats_client.py" (
    copy /Y "%GW_SRC%\nats_client.py" "%REL%\gw\" >nul
    copy /Y "%GW_SRC%\nats_client.py" "%REL%\ilova\gw\" >nul
  )
  if exist "%GW_SRC%\requirements.txt" (
    copy /Y "%GW_SRC%\requirements.txt" "%REL%\gw\" >nul
    copy /Y "%GW_SRC%\requirements.txt" "%REL%\ilova\gw\" >nul
  )
  if exist "%GW_SRC%\adapters" (
    xcopy /E /I /Y "%GW_SRC%\adapters\*.py" "%REL%\gw\adapters\" >nul
    xcopy /E /I /Y "%GW_SRC%\adapters\*.py" "%REL%\ilova\gw\adapters\" >nul
  )
  echo [OK] gw/
) else (
  echo [OGOHLANTIRISH] device-gw topilmadi — tunnel GW yo'li ishlamasligi mumkin.
)

echo cloudflared paketga (bitta nusxa — GitHub 100MB limuti)...
mkdir "%REL%\runtime" 2>nul
REM Drop copies baked into onedir / accidental duplicates.
if exist "%REL%\ilova\_internal\cloudflared.exe" del /F /Q "%REL%\ilova\_internal\cloudflared.exe" >nul 2>nul
if exist "%REL%\ilova\runtime\cloudflared.exe" del /F /Q "%REL%\ilova\runtime\cloudflared.exe" >nul 2>nul
if exist "%REL%\ilova\cloudflared.exe" del /F /Q "%REL%\ilova\cloudflared.exe" >nul 2>nul
set "CF_SRC="
if exist "%CD%\runtime\cloudflared.exe" set "CF_SRC=%CD%\runtime\cloudflared.exe"
if not defined CF_SRC if exist "%CD%\..\cloudflared.exe" set "CF_SRC=%CD%\..\cloudflared.exe"
if not defined CF_SRC if exist "%REL%\runtime\cloudflared.exe" set "CF_SRC=%REL%\runtime\cloudflared.exe"
if not defined CF_SRC (
  echo cloudflared yuklanmoqda...
  powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%REL%\runtime\cloudflared.exe' -UseBasicParsing } catch { exit 1 }"
  if exist "%REL%\runtime\cloudflared.exe" set "CF_SRC=%REL%\runtime\cloudflared.exe"
)
if defined CF_SRC if exist "%CF_SRC%" (
  copy /Y "%CF_SRC%" "%REL%\runtime\cloudflared.exe" >nul
  echo [OK] runtime\cloudflared.exe
) else (
  echo [OGOHLANTIRISH] cloudflared yuklanmadi — birinchi restore internet bilan yuklaydi.
)

REM Portable Python intentionally NOT shipped in download ZIP/Setup (keeps packages
REM under GitHub 100MB). BOSHLASH uses frozen EXE; restore can install runtime later.
if exist "%REL%\runtime\python" (
  echo Portable Python paketdan olib tashlanmoqda (hajm)...
  rmdir /S /Q "%REL%\runtime\python" >nul 2>nul
)

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
if exist "%CD%\device_push.py" copy /Y "%CD%\device_push.py" "%REL%\" >nul
if exist "%CD%\START-GW.bat" copy /Y "%CD%\START-GW.bat" "%REL%\" >nul
if exist "%CD%\REPAIR-INSTALL.bat" copy /Y "%CD%\REPAIR-INSTALL.bat" "%REL%\" >nul
REM Service/CLI helpers + GUI sources (BOSHLASH prefers these over stale frozen EXE)
for %%F in (api_client.py auth_lock.py discovery.py passwords.py paths.py provision.py session.py runtime_setup.py tunnel_watch.py credential_store.py device_email.py device_security.py device_push.py punch_proxy.py face_agent.py isapi_http.py office_link_app.py office_link_gui.py desktop_app.py office_link_run.py service_worker.py) do (
  if exist "%CD%\%%F" copy /Y "%CD%\%%F" "%REL%\" >nul
)
if exist "%CD%\ui" xcopy /E /I /Y "%CD%\ui" "%REL%\ilova\ui\" >nul
if exist "%DIST%\ui" xcopy /E /I /Y "%DIST%\ui" "%REL%\ilova\ui\" >nul

> "%REL%\BOSHLASH.bat" (
  echo @echo off
  echo REM HR HUB Link — ofis ilovasini ochish
  echo REM Yangilangan .py + portable python birinchi; EXE — zaxira.
  echo cd /d "%%~dp0"
  echo if exist "%%~dp0runtime\python\pythonw.exe" if exist "%%~dp0office_link_app.py" ^(
  echo   start "" /D "%%~dp0" "%%~dp0runtime\python\pythonw.exe" "%%~dp0office_link_app.py"
  echo   exit /b 0
  echo ^)
  echo if exist "%%~dp0runtime\python\python.exe" if exist "%%~dp0office_link_app.py" ^(
  echo   start "" /D "%%~dp0" "%%~dp0runtime\python\python.exe" "%%~dp0office_link_app.py"
  echo   exit /b 0
  echo ^)
  echo where pythonw ^>nul 2^>^&1
  echo if %%ERRORLEVEL%%==0 if exist "%%~dp0office_link_app.py" ^(
  echo   start "" /D "%%~dp0" pythonw "%%~dp0office_link_app.py"
  echo   exit /b 0
  echo ^)
  echo if exist "%%~dp0ilova\HRHUB-Qurilma.exe" ^(
  echo   start "" /D "%%~dp0ilova" "%%~dp0ilova\HRHUB-Qurilma.exe"
  echo   exit /b 0
  echo ^)
  echo echo.
  echo echo [XATO] Ilova ochilmadi.
  echo echo Agar Windows «nashriyot tekshirilmadi» deb EXE ni bloklasa:
  echo echo   Windows xavfsizligi -^> Ilova va brauzer nazorati -^> Smart App Control -^> O'chirish
  echo echo   yoki Python o'rnatib BOSHLASH.bat ni qayta bosing.
  echo echo.
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
  echo Paket ichida: gw\ ^(device-gw^), runtime\cloudflared.exe
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
