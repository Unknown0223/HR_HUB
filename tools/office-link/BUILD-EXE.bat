@echo off
REM Build HRHUB-Qurilma.exe (no console). Optional — BOSHLASH.bat pythonw bilan ham ishlaydi.
cd /d "%~dp0"
python -m pip install --disable-pip-version-check -q pyinstaller
if errorlevel 1 (
  echo PyInstaller o'rnatilmadi.
  exit /b 1
)
python -m PyInstaller --noconfirm --clean "%~dp0HRHUB-Qurilma.spec"
if errorlevel 1 (
  echo Exe yig'ilmadi. GUI ni BOSHLASH.bat orqali pythonw bilan ishlatish mumkin.
  exit /b 1
)
echo.
echo Tayyor: dist\HRHUB-Qurilma\HRHUB-Qurilma.exe
exit /b 0
