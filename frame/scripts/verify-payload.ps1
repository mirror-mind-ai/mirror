# Validador canonico do payload do Mirror Frame (fonte unica dos asserts).
# Reutilizado por installer/build.ps1 e pelo CI - roda UMA vez por cadeia de
# build (package -> verify -> ISCC). Falha explicita se qualquer item ausente.
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

$required = @(
    'MirrorFrame.exe',
    'resources\app\preload.js',
    'resources\app\main\main.js',
    'resources\app\renderer\index.html',
    'resources\app\renderer\app.js',
    'resources\app\assets\mirror.ico',
    'resources\app\node_modules\@lydell\node-pty\index.js',
    'resources\app\node_modules\@lydell\node-pty-win32-x64\conpty.node',
    'resources\app\node_modules\@xterm\xterm\lib\xterm.js',
    'resources\app\node_modules\@xterm\addon-fit\lib\addon-fit.js'
)

$missing = @()
foreach ($rel in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $PayloadPath $rel))) { $missing += $rel }
}

if ($missing.Count -gt 0) {
    Write-Host "PAYLOAD INVALIDO em $PayloadPath" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  ausente: $_" -ForegroundColor Red }
    throw "verify-payload: $($missing.Count) item(ns) obrigatorio(s) ausente(s)."
}

Write-Host "verify-payload OK: $($required.Count) itens presentes em $PayloadPath" -ForegroundColor Green
