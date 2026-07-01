@echo off
setlocal enableextensions
rem ---------------------------------------------------------------------------
rem Mirror Mind launcher (Windows)
rem
rem Forces a UTF-8 console (code page 65001 + PYTHONUTF8) so Portuguese accents
rem render correctly, changes into the Mirror repository root, and starts Pi.
rem
rem Root auto-detection: this launcher works both from inside the repository
rem (installer\launcher\mirror.cmd -> root is ..\..) and from a separate bin\
rem directory created by the installer (bin\mirror.cmd -> root is ..\app). It
rem locates the root by looking for pyproject.toml in candidate locations.
rem ---------------------------------------------------------------------------

rem UTF-8 everywhere.
chcp 65001 >nul 2>&1
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

set "MIRROR_ROOT="
call :resolve_root "%~dp0..\app"
if not defined MIRROR_ROOT call :resolve_root "%~dp0..\.."
if not defined MIRROR_ROOT call :resolve_root "%~dp0app"

if not defined MIRROR_ROOT (
  echo.
  echo   X  Could not locate the Mirror installation folder.
  echo.
  echo      The installation may have been moved or removed.
  echo      Re-run the Mirror Mind installer to repair it.
  echo.
  pause
  exit /b 1
)

pushd "%MIRROR_ROOT%" 2>nul
if errorlevel 1 (
  echo.
  echo   X  Could not open the Mirror folder: %MIRROR_ROOT%
  echo.
  pause
  exit /b 1
)

rem Ensure Pi is available.
where pi >nul 2>&1
if errorlevel 1 (
  echo.
  echo   X  Pi ^(the Mirror harness^) was not found on PATH.
  echo.
  echo      Try opening a new terminal, or re-run the Mirror Mind installer.
  echo      You can also install it manually: npm install -g @earendil-works/coding-agent
  echo.
  popd
  pause
  exit /b 1
)

title Mirror Mind
echo Starting Mirror Mind... (type your message to begin)
echo.
pi %*
set "EXIT_CODE=%ERRORLEVEL%"

popd
endlocal & exit /b %EXIT_CODE%

:resolve_root
rem %~1 = candidate dir. Sets MIRROR_ROOT (absolute) if it contains pyproject.toml.
if exist "%~1\pyproject.toml" (
  for %%I in ("%~1") do set "MIRROR_ROOT=%%~fI"
)
goto :eof
