@echo off
REM HR HUB — qurilmani ulash (konsolsiz GUI)
cd /d "%~dp0"

if exist "%~dp0dist\HRHUB-Qurilma\HRHUB-Qurilma.exe" (
  start "" /D "%~dp0" "%~dp0dist\HRHUB-Qurilma\HRHUB-Qurilma.exe"
  exit /b 0
)

where pythonw >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" /D "%~dp0" pythonw "%~dp0office_link_app.py"
  exit /b 0
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" /D "%~dp0" py -3 -c "import runpy; runpy.run_path(r'%~dp0office_link_app.py', run_name='__main__')"
  exit /b 0
)

echo pythonw yoki HRHUB-Qurilma.exe topilmadi.
echo Avval Python o'rnating yoki BUILD-EXE.bat ni ishga tushiring.
pause
exit /b 1
