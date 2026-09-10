@echo off
REM Bitta Windows Setup.exe (EULA + o'rnatish). Avval: BUILD-EXE.bat + pack-release.bat
setlocal EnableExtensions
cd /d "%~dp0"

set "REL=%CD%\release\HRHUB-Link"
set "OUT=%CD%\release\HRHUB-Link-Setup.exe"
set "ASSET_DIR=%CD%\..\..\apps\api\assets\office-link"

if not exist "%REL%\ilova\HRHUB-Qurilma.exe" (
  if not exist "%REL%\HRHUB-Qurilma.exe" (
    echo [XATO] release\HRHUB-Link yo'q. Avval pack-release.bat
    if not defined NOPAUSE pause
    exit /b 1
  )
)

echo === HR HUB Link — Setup.exe ===
python -m pip install --disable-pip-version-check -q pyinstaller
if errorlevel 1 (
  echo [XATO] PyInstaller o'rnatilmadi.
  if not defined NOPAUSE pause
  exit /b 1
)

python -m PyInstaller --noconfirm --clean "%CD%\HRHUB-Link-Setup.spec"
if errorlevel 1 (
  echo [XATO] Setup.exe yig'ilmadi.
  if not defined NOPAUSE pause
  exit /b 1
)

if not exist "%CD%\dist\HRHUB-Link-Setup.exe" (
  echo [XATO] dist\HRHUB-Link-Setup.exe topilmadi.
  if not defined NOPAUSE pause
  exit /b 1
)

if not exist "%CD%\release" mkdir "%CD%\release"
copy /Y "%CD%\dist\HRHUB-Link-Setup.exe" "%OUT%" >nul
if exist "%ASSET_DIR%" (
  copy /Y "%OUT%" "%ASSET_DIR%\HRHUB-Link-Setup.exe" >nul
  echo [OK] Asset: %ASSET_DIR%\HRHUB-Link-Setup.exe
)

echo.
echo [OK] %OUT%
echo Yuklab olish: bitta Setup.exe — ichida ilova, EULA va o'rnatish.
if not defined NOPAUSE pause
exit /b 0
