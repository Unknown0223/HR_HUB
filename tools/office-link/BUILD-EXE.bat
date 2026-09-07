@echo off
REM Build portable HRHUB-Qurilma.exe (konsolsiz).
REM Kerak: Python 3 + pip. Natija: dist\HRHUB-Qurilma\HRHUB-Qurilma.exe
REM OFFICE_LINK_DOWNLOAD_URL bo'sh bo'lsa — shu faylni ofis PCga nusxalang.
REM Tezkor Python GUI (exe siz): BOSHLASH.bat
cd /d "%~dp0"
echo === HR HUB Link — EXE yigish ===
echo Papka: %CD%
python -m pip install --disable-pip-version-check -q pyinstaller
if errorlevel 1 (
  echo [XATO] PyInstaller o'rnatilmadi. Python/pip ni tekshiring.
  echo Muqobil: BOSHLASH.bat (pythonw)
  pause
  exit /b 1
)
python -m PyInstaller --noconfirm --clean "%~dp0HRHUB-Qurilma.spec"
if errorlevel 1 (
  echo [XATO] Exe yig'ilmadi.
  echo Muqobil: BOSHLASH.bat orqali pythonw bilan ishlatish mumkin.
  pause
  exit /b 1
)
echo.
echo [OK] Tayyor: dist\HRHUB-Qurilma\HRHUB-Qurilma.exe
echo Ofis PCga butun dist\HRHUB-Qurilma papkasini nusxalang (yoki BOSHLASH.bat).
echo Yo'riqnoma: QOLLAMA.txt
pause
exit /b 0
