@echo off
title CampusAR Setup
echo.
echo  CampusAR - Windows automatic setup
echo  Installs Git, Node.js, Docker if needed, then clones and configures the project.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap.ps1" %*
if errorlevel 1 (
    echo.
    echo Setup failed. See messages above.
    pause
    exit /b 1
)
echo.
pause
