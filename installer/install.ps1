<#
.SYNOPSIS
    Visible installation orchestrator for Mirror Mind.

.DESCRIPTION
    Runs bootstrap (prerequisites + clone/sync) and configuration in a single,
    visible console window so the user can see exactly what is happening at each
    step. This is what the Inno Setup wizard launches (NOT hidden), giving the
    real-time "panel" of progress.

    Behavior:
      * Prints a clear banner and per-phase headers.
      * Streams the live output of bootstrap.ps1 and configure.ps1.
      * On any failure, shows a friendly summary and KEEPS THE WINDOW OPEN so the
        user can read it (no more "it flashed and said done").
      * On success, prints next steps and closes after a short delay.

    Child scripts call `exit`, so they are invoked as separate powershell
    processes; their stdout/stderr inherit this console and appear live.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallDir,
    [Parameter(Mandatory)][string]$MirrorUser,
    [Parameter(Mandatory)][string]$OpenRouterApiKey,
    [string]$RepoUrl = 'https://github.com/mirror-mind-ai/mirror.git',
    [string]$RepoBranch = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here 'lib\MirrorInstall.psm1') -Force

try { chcp 65001 > $null } catch { }
try { $Host.UI.RawUI.WindowTitle = 'Mirror Mind - Installing' } catch { }

function Write-Banner {
    Write-Host ''
    Write-Host '  ============================================' -ForegroundColor Cyan
    Write-Host '   Mirror Mind - Windows installation' -ForegroundColor Cyan
    Write-Host '  ============================================' -ForegroundColor Cyan
    Write-Host "   Target folder : $InstallDir"
    Write-Host "   Source        : $RepoUrl ($RepoBranch)"
    Write-Host "   Log file      : $(Get-MirrorLogPath)"
    Write-Host ''
}

function Write-Phase {
    param([int]$Number, [int]$Total, [string]$Title)
    Write-Host ''
    Write-Host ("  [ Step {0}/{1} ] {2}" -f $Number, $Total, $Title) -ForegroundColor White
    Write-Host '  --------------------------------------------'
}

function Invoke-Child {
    param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string[]]$ScriptArgs)
    $ps = (Get-Command 'powershell.exe').Source
    & $ps -NoProfile -ExecutionPolicy Bypass -File $Script @ScriptArgs
    return $LASTEXITCODE
}

function Hold-Window {
    param([string]$Prompt = 'Press Enter to close this window...')
    Write-Host ''
    try { Read-Host $Prompt | Out-Null } catch { Start-Sleep -Seconds 30 }
}

$exitCode = 0
try {
    Write-Banner
    Write-MirrorLog -Message "install.ps1 start (InstallDir=$InstallDir User=$MirrorUser Repo=$RepoUrl@$RepoBranch)" | Out-Null

    Write-Phase -Number 1 -Total 2 -Title 'Installing prerequisites and downloading Mirror'
    $rc = Invoke-Child -Script (Join-Path $here 'bootstrap.ps1') -ScriptArgs @(
        '-InstallDir', $InstallDir, '-RepoUrl', $RepoUrl, '-Branch', $RepoBranch
    )
    if ($rc -ne 0) {
        Write-Host ''
        Write-Host '  Installation stopped during setup of prerequisites/files.' -ForegroundColor Red
        Write-Host "  See the messages above and the log: $(Get-MirrorLogPath)"
        $exitCode = 1
        Hold-Window
        exit $exitCode
    }

    Write-Phase -Number 2 -Total 2 -Title 'Configuring your Mirror identity'
    $rc = Invoke-Child -Script (Join-Path $here 'configure.ps1') -ScriptArgs @(
        '-InstallDir', $InstallDir, '-MirrorUser', $MirrorUser, '-OpenRouterApiKey', $OpenRouterApiKey
    )
    if ($rc -ne 0) {
        Write-Host ''
        Write-Host '  Files were installed, but configuration did not finish.' -ForegroundColor Yellow
        Write-Host "  You can re-run configuration later. Log: $(Get-MirrorLogPath)"
        $exitCode = 1
        Hold-Window
        exit $exitCode
    }

    Write-Host ''
    Write-Host '  ============================================' -ForegroundColor Green
    Write-Host '   Mirror Mind is installed and configured.' -ForegroundColor Green
    Write-Host '  ============================================' -ForegroundColor Green
    Write-Host '   Use the "Mirror Mind" shortcut on your Desktop to start.'
    Write-Host ''
    Write-MirrorLog -Message 'install.ps1 complete OK' | Out-Null
    Start-Sleep -Seconds 4
    exit 0
}
catch {
    $obj = $_.TargetObject
    if ($obj -and ($obj.PSObject.Properties.Name -contains 'IsFriendly') -and $obj.IsFriendly) {
        Write-Host (Format-FriendlyError $obj.Friendly) -ForegroundColor Red
    } else {
        $fe = New-FriendlyError -Code 'INSTALL_UNEXPECTED' -Message 'The installer hit an unexpected problem.' `
            -Cause $_.Exception.Message -Action 'Re-run the installer. If it persists, share the log file.'
        Write-Host (Format-FriendlyError $fe) -ForegroundColor Red
    }
    Hold-Window
    exit 1
}
