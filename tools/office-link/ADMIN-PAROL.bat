@echo off
title Worklyn — admin parol (maxfiy)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0link.ps1" -Mode admin
echo.
pause
