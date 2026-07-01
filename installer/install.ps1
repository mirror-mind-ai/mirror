<#
.SYNOPSIS
    Installation orchestrator for Mirror Mind (non-interactive).

.DESCRIPTION
    Runs bootstrap (prerequisites + clone/sync) and configuration, printing a
    clear per-phase progress transcript to stdout. It never pauses for input:
    the installer captures this stdout and shows it live INSIDE the wizard
    window (see mirror.iss), so there is no separate console window and no
    Read-Host that could hang a redirected run.

    Exit codes: 0 = success, non-zero = failure (the wizard keeps the transcript
    visible and surfaces a friendly message).
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

function Write-Banner {
    Write-Host '============================================'
    Write-Host ' Mirror Mind - Windows installation'
    Write-Host '============================================'
    Write-Host " Target folder : $InstallDir"
    Write-Host " Source        : $RepoUrl ($RepoBranch)"
    Write-Host " Log file      : $(Get-MirrorLogPath)"
    Write-Host ''
}

function Write-Phase {
    param([int]$Number, [int]$Total, [string]$Title)
    Write-Host ''
    Write-Host ("[ Step {0}/{1} ] {2}" -f $Number, $Total, $Title)
    Write-Host '--------------------------------------------'
}

function Invoke-Child {
    param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string[]]$ScriptArgs)
    $ps = (Get-Command 'powershell.exe').Source
    & $ps -NoProfile -ExecutionPolicy Bypass -File $Script @ScriptArgs
    return $LASTEXITCODE
}

try {
    Write-Banner
    Write-MirrorLog -Message "install.ps1 start (InstallDir=$InstallDir User=$MirrorUser Repo=$RepoUrl@$RepoBranch)" | Out-Null

    Write-Phase -Number 1 -Total 2 -Title 'Installing prerequisites and downloading Mirror'
    $rc = Invoke-Child -Script (Join-Path $here 'bootstrap.ps1') -ScriptArgs @(
        '-InstallDir', $InstallDir, '-RepoUrl', $RepoUrl, '-Branch', $RepoBranch
    )
    if ($rc -ne 0) {
        Write-Host ''
        Write-Host 'Installation stopped during setup of prerequisites/files.'
        Write-Host "See the messages above and the log: $(Get-MirrorLogPath)"
        exit 1
    }

    Write-Phase -Number 2 -Total 2 -Title 'Configuring your Mirror identity'
    $rc = Invoke-Child -Script (Join-Path $here 'configure.ps1') -ScriptArgs @(
        '-InstallDir', $InstallDir, '-MirrorUser', $MirrorUser, '-OpenRouterApiKey', $OpenRouterApiKey
    )
    if ($rc -ne 0) {
        Write-Host ''
        Write-Host 'Files were installed, but configuration did not finish.'
        Write-Host "You can re-run configuration later. Log: $(Get-MirrorLogPath)"
        exit 1
    }

    Write-Host ''
    Write-Host '============================================'
    Write-Host ' Mirror Mind is installed and configured.'
    Write-Host '============================================'
    Write-Host ' Use the "Mirror Mind" shortcut on your Desktop to start.'
    Write-MirrorLog -Message 'install.ps1 complete OK' | Out-Null
    exit 0
}
catch {
    $obj = $_.TargetObject
    if ($obj -and ($obj.PSObject.Properties.Name -contains 'IsFriendly') -and $obj.IsFriendly) {
        Write-Host (Format-FriendlyError $obj.Friendly)
    } else {
        $fe = New-FriendlyError -Code 'INSTALL_UNEXPECTED' -Message 'The installer hit an unexpected problem.' `
            -Cause $_.Exception.Message -Action 'Re-run the installer. If it persists, share the log file.'
        Write-Host (Format-FriendlyError $fe)
    }
    exit 1
}
