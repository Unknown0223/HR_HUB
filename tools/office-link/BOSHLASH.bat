@echo off
REM HR HUB — qurilmani ulash (konsolsiz GUI)
REM Smart App Control imzosiz EXE ni bloklaydi — avvalo pythonw.
cd /d "%~dp0"

REM 1) Manba / Python (SAC EXE ni bloklamaydi)
where pythonw >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" /D "%~dp0" pythonw "%~dp0office_link_app.py"
  exit /b 0
)

if exist "%~dp0runtime\python\pythonw.exe" (
  start "" /D "%~dp0" "%~dp0runtime\python\pythonw.exe" "%~dp0office_link_app.py"
  exit /b 0
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" /D "%~dp0" py -3 -c "import runpy; runpy.run_path(r'%~dp0office_link_app.py', run_name='__main__')"
  exit /b 0
)

REM 2) PyInstaller EXE (Smart App Control bloklashi mumkin)
if exist "%~dp0release\HRHUB-Link\ilova\HRHUB-Qurilma.exe" (
  start "" /D "%~dp0release\HRHUB-Link\ilova" "%~dp0release\HRHUB-Link\ilova\HRHUB-Qurilma.exe"
  exit /b 0
)

if exist "%~dp0dist\HRHUB-Qurilma\HRHUB-Qurilma.exe" (
  start "" /D "%~dp0dist\HRHUB-Qurilma" "%~dp0dist\HRHUB-Qurilma\HRHUB-Qurilma.exe"
  exit /b 0
)

if exist "%~dp0ilova\HRHUB-Qurilma.exe" (
  start "" /D "%~dp0ilova" "%~dp0ilova\HRHUB-Qurilma.exe"
  exit /b 0
)

echo.
echo [XATO] pythonw yoki HRHUB-Qurilma.exe topilmadi.
echo.
echo Smart App Control EXE ni bloklasa:
echo   1) Python o'rnating, keyin yana BOSHLASH.bat
echo   2) yoki: Windows xavfsizligi -^> Ilova va brauzer nazorati
echo      -^> Smart App Control -^> O'chirish
echo.
pause
exit /b 1
