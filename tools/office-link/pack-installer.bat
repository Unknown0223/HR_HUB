@echo off
REM MSI-lite: onedir build + service skriptlarini ZIP qilish
REM To'liq MSI uchun: INSTALL.iss (Inno Setup)
setlocal EnableExtensions
cd /d "%~dp0"

echo === HR HUB Link — pack installer ^(ZIP^) ===
set "DIST=%CD%\dist\HRHUB-Qurilma"
set "OUTDIR=%CD%\dist"
set "ZIP=%OUTDIR%\HRHUB-Link-portable.zip"

if not exist "%DIST%\HRHUB-Qurilma.exe" (
  echo [XATO] onedir yo'q: %DIST%\HRHUB-Qurilma.exe
  echo Avval BUILD-EXE.bat ni ishga tushiring, keyin pack-installer.bat.
  pause
  exit /b 1
)

echo Service fayllari nusxalanmoqda...
copy /Y "%CD%\install-service.bat" "%DIST%\install-service.bat" >nul
copy /Y "%CD%\uninstall-service.bat" "%DIST%\uninstall-service.bat" >nul
copy /Y "%CD%\SERVICE.txt" "%DIST%\SERVICE.txt" >nul
copy /Y "%CD%\QOLLAMA.txt" "%DIST%\QOLLAMA.txt" >nul
if exist "%CD%\service_worker.py" copy /Y "%CD%\service_worker.py" "%DIST%\service_worker.py" >nul
if exist "%CD%\bulk_provision.py" copy /Y "%CD%\bulk_provision.py" "%DIST%\bulk_provision.py" >nul

echo ZIP yig'ilmoqda: %ZIP%
if exist "%ZIP%" del /F /Q "%ZIP%"
powershell -NoProfile -Command ^
  "Compress-Archive -Path '%DIST%\*' -DestinationPath '%ZIP%' -Force"
if errorlevel 1 (
  echo [XATO] ZIP yaratilmadi.
  pause
  exit /b 1
)

echo.
echo [OK] %ZIP%
echo Ofis PCga ZIP ni oching, keyin install-service.bat ^(ADMIN^).
echo To'liq ofis papkasi ^(exe+bat+buyruqlar^): pack-release.bat
echo To'liq Setup.exe: Inno Setup bilan INSTALL.iss ni compile qiling.
pause
exit /b 0

