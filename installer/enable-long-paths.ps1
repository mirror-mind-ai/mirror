<#
.SYNOPSIS
    (Optional, requires admin) Enable Windows long path support (>260 chars).

.DESCRIPTION
    Mirror can create deeply nested roadmap directories
    (docs/project/roadmap/<cv>/<ds>/<ts>/...). On Windows the legacy MAX_PATH
    limit of 260 characters can break such paths unless long path support is on.

    This script sets HKLM\SYSTEM\CurrentControlSet\Control\FileSystem
    LongPathsEnabled = 1. It is NOT run automatically by the installer because
    it is a machine-wide change that needs Administrator rights. Run it yourself
    only if you hit "filename or extension is too long" errors.

    A reboot (or sign-out) is recommended for the change to fully apply.
#>
[CmdletBinding()]
param([switch]$WhatIfOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$key = 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem'
$name = 'LongPathsEnabled'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$current = (Get-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue).$name
Write-Host "Current $name = $current"

if ($current -eq 1) {
    Write-Host 'Long path support is already enabled. Nothing to do.' -ForegroundColor Green
    exit 0
}

if ($WhatIfOnly) {
    Write-Host "Would set $key\$name = 1 (requires admin, then reboot)." -ForegroundColor Yellow
    exit 0
}

if (-not (Test-Admin)) {
    Write-Host ''
    Write-Host '  X  Administrator rights are required to enable long paths.' -ForegroundColor Yellow
    Write-Host '     Right-click PowerShell and "Run as administrator", then run this script again.'
    Write-Host ''
    exit 2
}

Set-ItemProperty -Path $key -Name $name -Value 1 -Type DWord
Write-Host "Set $name = 1." -ForegroundColor Green
Write-Host 'Please reboot (or sign out and back in) for the change to take effect.'
exit 0
