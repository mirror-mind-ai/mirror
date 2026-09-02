<#
.SYNOPSIS
    Compile the Mirror Mind Windows installer (.exe) with Inno Setup.

.DESCRIPTION
    Locates the Inno Setup compiler (ISCC.exe). If it is missing, prints a
    friendly message with the exact winget command to install it. On success the
    installer is written to <repo>\dist\MirrorMind-Setup-<version>.exe.

.PARAMETER Version
    Version stamped into the installer. Defaults to installer/VERSION - the
    installer's own version, decoupled from the Mirror product version.

.PARAMETER RepoUrl
    Overrides the clone URL baked into the installer (useful for testing a fork).

.PARAMETER RepoBranch
    Overrides the branch baked into the installer (useful for testing a branch).
#>
[CmdletBinding()]
param(
    [string]$Version,
    [string]$RepoUrl,
    [string]$RepoBranch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $here
Import-Module (Join-Path $here 'lib\MirrorInstall.psm1') -Force

function Find-Iscc {
    $onPath = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
    $candidates = @()
    if ($onPath) { $candidates += $onPath.Source }
    $candidates += @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
        "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
    )
    return ($candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
}

function Get-InstallerVersion {
    <#
    .SYNOPSIS
        The installer's OWN version - independent of the Mirror product version.
    .DESCRIPTION
        The installer is a bootstrapper. Mirror updates itself in place through
        the git-based runtime updater, so the .exe version is intentionally
        decoupled from whatever Mirror version it installs. Bump installer/VERSION
        only when the installer itself changes.
    #>
    $vf = Join-Path $here 'VERSION'
    if (Test-Path -LiteralPath $vf) {
        $v = (Get-Content -LiteralPath $vf -Raw).Trim()
        if ($v) { return $v }
    }
    return '0.31.0'
}

if (-not $Version) { $Version = Get-InstallerVersion }

# --- Fail-closed packaging chain: package -> verify (once) -> ISCC ----------
# The Frame is a required component: shortcuts point at MirrorFrame.exe, so a
# successful installer build without a valid Frame payload would ship broken
# primary shortcuts. Both steps abort this script on failure.
$frameScripts = Join-Path $repoRoot 'frame\scripts'
Write-Host "Packaging the Frame..." -ForegroundColor White
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $frameScripts 'package.ps1')
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frame packaging failed ($LASTEXITCODE) - installer build aborted." -ForegroundColor Red
    exit 1
}
Write-Host "Verifying the Frame payload (single canonical validator)..." -ForegroundColor White
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $frameScripts 'verify-payload.ps1')
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frame payload verification failed ($LASTEXITCODE) - installer build aborted." -ForegroundColor Red
    exit 1
}

$iscc = Find-Iscc
if (-not $iscc) {
    $fe = New-FriendlyError -Code 'NO_INNO_SETUP' `
        -Message 'Inno Setup (the installer compiler) was not found.' `
        -Cause 'ISCC.exe is not on PATH or under Program Files.' `
        -Action 'Install it with:  winget install --id JRSoftware.InnoSetup --exact  then re-run this script.'
    Write-Host (Format-FriendlyError $fe) -ForegroundColor Yellow
    exit 2
}

$iss = Join-Path $here 'mirror.iss'
$defs = @("/DAppVersion=$Version")
if ($RepoUrl)    { $defs += "/DRepoUrl=$RepoUrl" }
if ($RepoBranch) { $defs += "/DRepoBranch=$RepoBranch" }

Write-Host "Compiling installer v$Version with $iscc" -ForegroundColor White
& $iscc @defs $iss
if ($LASTEXITCODE -ne 0) {
    Write-Host "Inno Setup compilation failed ($LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

$out = Join-Path $repoRoot "dist\MirrorMind-Setup-$Version.exe"
if (Test-Path $out) {
    Write-Host ""
    Write-Host "Built: $out" -ForegroundColor Green
    $hash = (Get-FileHash -Algorithm SHA256 -Path $out).Hash
    Write-Host "SHA256: $hash"
} else {
    Write-Host "Compilation reported success but output was not found at $out" -ForegroundColor Yellow
}
exit 0
