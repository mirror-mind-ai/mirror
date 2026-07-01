@echo off
setlocal enableextensions
rem ---------------------------------------------------------------------------
rem Mirror Mind launcher (Windows)
rem
rem Forces a UTF-8 console (code page 65001 + PYTHONUTF8) so Portuguese accents
rem render correctly, changes into the Mirror repository root, and starts Pi.
rem
rem Root auto-detection uses inline checks (no CALL :label subroutines) so the
rem script is robust even if line endings are not perfect. It works both from a
rem bin\ directory next to app\ (installer layout) and from inside the repo.
rem ---------------------------------------------------------------------------

chcp 65001 >nul 2>&1
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"

set "MIRROR_ROOT="
if exist "%~dp0..\app\pyproject.toml" set "MIRROR_ROOT=%~dp0..\app"
if not defined MIRROR_ROOT if exist "%~dp0..\..\pyproject.toml" set "MIRROR_ROOT=%~dp0..\.."
if not defined MIRROR_ROOT if exist "%~dp0app\pyproject.toml" set "MIRROR_ROOT=%~dp0app"

if not defined MIRROR_ROOT (
  echo.
  echo   X  Could not locate the Mirror installation folder.
  echo.
  echo      The installation may be incomplete, moved or removed.
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

where pi >nul 2>&1
if errorlevel 1 (
  echo.
  echo   X  Pi ^(the Mirror harness^) was not found on PATH.
  echo.
  echo      Open a new terminal, or re-run the Mirror Mind installer.
  echo      Manual install: npm install -g @earendil-works/pi-coding-agent
  echo.
  popd
  pause
  exit /b 1
)

rem First-launch guidance: Mirror needs an AI subscription for the conversation
rem (via Pi's /login). The OpenRouter key only powers memory. Shown once.
if not exist "%~dp0.mirror-first-run" (
  echo.
  echo   ===========================================================
  echo    First launch  /  Primeiro acesso
  echo   -----------------------------------------------------------
  echo    Mirror runs the CONVERSATION through your AI subscription.
  echo    On first launch, type   /login   inside Mirror to connect
  echo    it ^(Codex Plus recommended^). Your OpenRouter key powers
  echo    the MEMORY, not the chat model.
  echo.
  echo    O Mirror roda a CONVERSA pela sua assinatura de IA.
  echo    No primeiro acesso, digite   /login   dentro do Mirror para
  echo    conectar ^(Codex Plus recomendado^). A chave OpenRouter
  echo    cuida da MEMORIA, nao do modelo de chat.
  echo   ===========================================================
  echo.
  >"%~dp0.mirror-first-run" echo shown
)

title Mirror Mind
echo Starting Mirror Mind... (type your message to begin)
echo.
pi %*
set "EXIT_CODE=%ERRORLEVEL%"

popd
endlocal & exit /b %EXIT_CODE%
