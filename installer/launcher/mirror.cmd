@echo off
setlocal enableextensions
rem ---------------------------------------------------------------------------
rem Mirror Mind launcher (Windows). Installed to {app}\bin by MirrorMind-Setup.
rem UTF-8 console (the Mirror writes UTF-8; cmd's default code page would show
rem accents as mojibake), Notepad as the editor until the runtime defaults to
rem it, the install's own Node and Git first on the PATH, Pi in the workspace.
rem Pi keys its sessions by this folder, so every session is found again here.
rem `call` matters: pi.cmd is an npm shim that ends its own context with a
rem failing goto; chained without call it would tear down this setlocal too,
rem and pi would start in the caller's folder with the caller's PATH.
rem ---------------------------------------------------------------------------
chcp 65001 >nul 2>&1
set "MIRROR_APP=%~dp0.."
for %%I in ("%MIRROR_APP%") do set "MIRROR_APP=%%~fI"
set "Path=%MIRROR_APP%\node;%MIRROR_APP%\git\cmd;%Path%"
if not defined EDITOR set "EDITOR=notepad"
set "MIRROR_WORKSPACE=%USERPROFILE%\Mirror"
if not exist "%MIRROR_WORKSPACE%" mkdir "%MIRROR_WORKSPACE%"

where pi >nul 2>&1 || (
  echo [Mirror Mind] Pi was not found. Re-run the installer to repair.
  pause
  exit /b 1
)

cd /d "%MIRROR_WORKSPACE%"
title Mirror Mind
call pi %*
endlocal
