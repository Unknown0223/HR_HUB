@echo off
REM To'liq mustaqil ofis paketi: ichki Python + kutubxonalar + gw + cloudflared
REM → release\HRHUB-Link\ va release\HRHUB-Link-portable.zip
REM Ofis PCga hech narsa o'rnatish shart emas (Python ham).
setlocal EnableExtensions
cd /d "%~dp0"

echo === HR HUB Link — release paket ===
where python >nul 2>&1
if errorlevel 1 (
  echo [XATO] Yig'ish uchun shu kompyuterda python kerak ^(ofis PCga emas^).
  if not defined NOPAUSE pause
  exit /b 1
)
python "%CD%\build_bundle.py" %*
if errorlevel 1 (
  echo [XATO] Paket yig'ilmadi.
  if not defined NOPAUSE pause
  exit /b 1
)
echo Ofis PCga release\HRHUB-Link papkasini yoki ZIP ni bering; keyin: pack-setup.bat
if not defined NOPAUSE pause
exit /b 0
