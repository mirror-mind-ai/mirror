<#
.SYNOPSIS
    Mirror Mind Windows Uninstaller

.DESCRIPTION
    Removes Mirror Mind repo, adapter, shortcuts and env vars.
    User data in ~/.mirror-minds/ is preserved.
#>

param(
    [string]$InstallDir = "$env:LOCALAPPDATA\MirrorMind",
    [switch]$Confirm
)

Write-Host ""
Write-Host "Mirror Mind - Uninstaller" -ForegroundColor Cyan
Write-Host ("=" * 40)
Write-Host ""

$mirrorData = Join-Path $env:USERPROFILE ".mirror-minds"

Write-Host "This will remove:" -ForegroundColor Yellow
Write-Host "  - Repo:     $InstallDir\repo" -ForegroundColor White
Write-Host "  - Adapter:  $InstallDir\adapter" -ForegroundColor White
Write-Host "  - Logs:     $InstallDir\logs" -ForegroundColor White
Write-Host "  - Shortcut: Start Menu\Mirror Mind" -ForegroundColor White
Write-Host "  - Env vars: PYTHONSTARTUP, MIRROR_USER" -ForegroundColor White
Write-Host ""
Write-Host "PRESERVED (your data):" -ForegroundColor Green
Write-Host "  - $mirrorData" -ForegroundColor Green
Write-Host ""

if (-not $Confirm) {
    $answer = Read-Host "Continue? (y/N)"
    if ($answer -ne "y") {
        Write-Host "Cancelled."
        exit 0
    }
}

# Remove install directory
if (Test-Path $InstallDir) {
    Write-Host "Removing $InstallDir..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
}

# Remove shortcut
$shortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Mirror Mind.lnk"
if (Test-Path $shortcut) {
    Write-Host "Removing shortcut..." -ForegroundColor Yellow
    Remove-Item -Force $shortcut -ErrorAction SilentlyContinue
}

# Remove env vars
Write-Host "Removing environment variables..." -ForegroundColor Yellow
[Environment]::SetEnvironmentVariable("PYTHONSTARTUP", $null, "User")
[Environment]::SetEnvironmentVariable("MIRROR_USER", $null, "User")

# Remove Pi settings override
$piSettings = Join-Path $env:USERPROFILE ".pi\agent\settings.json"
if (Test-Path $piSettings) {
    Write-Host "Removing Pi extension override..." -ForegroundColor Yellow
    Remove-Item -Force $piSettings -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Uninstall complete." -ForegroundColor Green
Write-Host "Your data at $mirrorData was preserved." -ForegroundColor Green
Write-Host "To remove your data too, delete that folder manually." -ForegroundColor Gray
