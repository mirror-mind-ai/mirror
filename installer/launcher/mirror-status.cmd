@echo off
setlocal enableextensions
rem Mirror Mind - Status. The runtime's own view of the install, for support.
chcp 65001 >nul 2>&1
set "MIRROR_APP=%~dp0.."
for %%I in ("%MIRROR_APP%") do set "MIRROR_APP=%%~fI"
set "Path=%MIRROR_APP%\node;%MIRROR_APP%\git\cmd;%Path%"
set "npm_config_prefix=%MIRROR_APP%\node"
title Mirror Mind - Status
echo.
call mirror runtime status
echo.
call mirror runtime diagnose
echo.
echo Logs: %MIRROR_APP%\logs
echo.
pause
endlocal
