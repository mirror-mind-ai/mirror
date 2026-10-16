<#
.SYNOPSIS
    Compile the Mirror Mind Windows installer (.exe) with Inno Setup 6.

.DESCRIPTION
    Writes <repo>\dist\MirrorMind-Setup-<version>.exe. The version is the
    installer's own (installer\VERSION), decoupled from the mirror-mind
    package version the installer fetches from npm.

.PARAMETER Version
    Overrides installer\VERSION.
.PARAMETER MirrorVersion
    npm dist-tag or version of mirror-mind baked as the install target.
    Default: latest.
#>
[CmdletBinding()]
param(
    [string]$Version,
    [string]$MirrorVersion = "latest",
    # Appended to the output name, e.g. -b2, when the previous .exe is held open (a Sandbox mapping it).
    [string]$OutputSuffix = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Version) { $Version = (Get-Content (Join-Path $here "VERSION") -Raw).Trim() }

$candidates = @(
    (Get-Command "ISCC.exe" -ErrorAction SilentlyContinue | ForEach-Object Source),
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) }
if (-not $candidates) {
    Write-Error "Inno Setup 6 not found. Install it with: winget install --id JRSoftware.InnoSetup --scope user"
}
$iscc = $candidates | Select-Object -First 1

& $iscc "/DAppVersion=$Version" "/DMirrorVersion=$MirrorVersion" "/DOutputSuffix=$OutputSuffix" (Join-Path $here "mirror.iss")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$out = Join-Path (Split-Path -Parent $here) "dist\MirrorMind-Setup-$Version.exe"
Write-Host ("built {0} ({1:N1} MB)" -f $out, ((Get-Item $out).Length / 1MB))
