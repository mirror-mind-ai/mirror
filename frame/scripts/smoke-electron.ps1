# Smoke Electron/ConPTY: executa o MirrorFrame.exe EMPACOTADO em modo
# self-test (MIRROR_FRAME_SELFTEST=1) e verifica o codigo de saida.
# Prova que o binario nativo do node-pty funciona sob o Node do Electron e no
# layout empacotado - a unica classe de defeito que os testes Node puros nao
# cobrem (ABI + packaging).
[CmdletBinding()]
param(
    [string]$PayloadPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $PayloadPath) {
    $frameDir = Split-Path -Parent $PSScriptRoot
    $PayloadPath = Join-Path $frameDir 'out\MirrorFrame-win32-x64'
}
$exe = Join-Path $PayloadPath 'MirrorFrame.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "smoke: MirrorFrame.exe ausente em $PayloadPath" }

$env:MIRROR_FRAME_SELFTEST = '1'
try {
    $p = Start-Process -FilePath $exe -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) { throw "smoke Electron/ConPTY FALHOU (exit=$($p.ExitCode))" }
    Write-Host "smoke Electron/ConPTY OK (exit=0)" -ForegroundColor Green
} finally {
    Remove-Item Env:MIRROR_FRAME_SELFTEST -ErrorAction SilentlyContinue
}
