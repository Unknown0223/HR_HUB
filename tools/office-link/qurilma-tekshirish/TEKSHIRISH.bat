@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0qurilma-tekshirish.ps1" %*
echo.
pause
