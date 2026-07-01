<#
.SYNOPSIS
    Installation orchestrator for Mirror Mind (non-interactive).

.DESCRIPTION
    Runs the install in phases, printing a clear per-phase progress transcript to
    stdout. It never pauses for input: the installer captures this stdout and
    shows it live INSIDE the wizard window (see mirror.iss).

    Phases (the Inno wizard drives these so identity is collected at the END):
      * bootstrap - install prerequisites (Git, Node, uv, Pi) and clone/sync the
                    repo. Needs no personal data.
      * configure - write .env, initialize identity, validate the OpenRouter key.
                    Needs MirrorUser + OpenRouterApiKey.
      * all       - bootstrap then configure (CLI / interactive use).

    Exit codes: 0 = success, non-zero = failure (the wizard keeps the transcript
    visible and surfaces a friendly message).

.PARAMETER Phase
    Which phase(s) to run: bootstrap | configure | all (default: all).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$InstallDir,
    [string]$MirrorUser,
    [string]$OpenRouterApiKey,
    [ValidateSet('all', 'bootstrap', 'configure')][string]$Phase = 'all',
    [string]$RepoUrl = 'https://github.com/mirror-mind-ai/mirror.git',
    [string]$RepoBranch = 'stable'
)

Set-StrictMode -Version Latest
# PS 5.1: 'Continue' so native/child commands writing to stderr do not raise
# spurious terminating errors; child exit codes are checked explicitly.
$ErrorActionPreference = 'Continue'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here 'lib\MirrorInstall.psm1') -Force -ErrorAction Stop

# Persistent, timestamped detail log kept under <install-base>\logs so multiple
# runs are retained for future analysis. The Inno wrapper sets MIRROR_INSTALL_LOG
# once and reuses it across the bootstrap and configure phases; a standalone run
# creates its own.
if (-not $env:MIRROR_INSTALL_LOG) {
    $logRoot = Join-Path (Split-Path $InstallDir -Parent) 'logs'
    if (-not (Test-Path -LiteralPath $logRoot)) {
        New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    }
    $env:MIRROR_INSTALL_LOG = Join-Path $logRoot ("install-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}

try { chcp 65001 > $null } catch { }

function Get-InstallerVersion {
    # Version stamped into the shipped app, if present; else 'dev'.
    $pyproject = Join-Path $InstallDir 'pyproject.toml'
    if (Test-Path -LiteralPath $pyproject) {
        $m = Select-String -Path $pyproject -Pattern '^version\s*=\s*"([^"]+)"' | Select-Object -First 1
        if ($m) { return $m.Matches[0].Groups[1].Value }
    }
    return 'dev'
}

function Show-DetailLog {
    $lp = Get-MirrorLogPath
    Write-Host ''
    Write-Host "----- detail log ($lp) -----"
    if (Test-Path -LiteralPath $lp) {
        Get-Content -LiteralPath $lp | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host '(no detail log found)'
    }
    Write-Host '----- end detail log -----'
}

function Write-Banner {
    Write-Host '============================================'
    Write-Host ' Mirror Mind - Windows installation'
    Write-Host '============================================'
    Write-Host " Target folder : $InstallDir"
    Write-Host " Source        : $RepoUrl ($RepoBranch)"
    Write-Host " Phase         : $Phase"
    Write-Host " Log file      : $(Get-MirrorLogPath)"
    Write-Host ''
}

function Write-Phase {
    param([string]$Title)
    Write-Host ''
    Write-Host "[ $Title ]"
    Write-Host '--------------------------------------------'
}

function Invoke-Child {
    param([Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string[]]$ScriptArgs)
    $ps = (Get-Command 'powershell.exe').Source
    # Stream the child's output straight to the host (-> the redirected transcript)
    # via Out-Host, so progress lines are shown and the exit code stays clean.
    & $ps -NoProfile -ExecutionPolicy Bypass -File $Script @ScriptArgs 2>&1 | Out-Host
    return $LASTEXITCODE
}

function Invoke-BootstrapPhase {
    Write-Phase -Title 'Installing prerequisites and downloading Mirror'
    return (Invoke-Child -Script (Join-Path $here 'bootstrap.ps1') -ScriptArgs @(
            '-InstallDir', $InstallDir, '-RepoUrl', $RepoUrl, '-Branch', $RepoBranch
        ))
}

function Invoke-ConfigurePhase {
    if (-not $MirrorUser -or -not $OpenRouterApiKey) {
        Write-Host 'Configuration needs both a name (MIRROR_USER) and an OpenRouter API key.'
        return 2
    }
    Write-Phase -Title 'Configuring your Mirror identity'
    return (Invoke-Child -Script (Join-Path $here 'configure.ps1') -ScriptArgs @(
            '-InstallDir', $InstallDir, '-MirrorUser', $MirrorUser, '-OpenRouterApiKey', $OpenRouterApiKey
        ))
}

try {
    Write-Banner
    Write-MirrorLog -Message "install.ps1 start (Phase=$Phase InstallDir=$InstallDir Repo=$RepoUrl@$RepoBranch)" | Out-Null

    if ($Phase -eq 'bootstrap' -or $Phase -eq 'all') {
        # Environment snapshot at the top of the bootstrap phase (no secrets).
        Write-MirrorEnvironmentBanner -InstallerVersion (Get-InstallerVersion) `
            -InstallDir $InstallDir -RepoUrl $RepoUrl -RepoBranch $RepoBranch -MirrorUser $MirrorUser
    }

    if ($Phase -eq 'bootstrap' -or $Phase -eq 'all') {
        $rc = Invoke-BootstrapPhase
        if ($rc -ne 0) {
            Write-Host ''
            Write-Host "Installation stopped during setup of prerequisites/files (bootstrap exit code $rc)."
            Write-Host "See the messages above and the log: $(Get-MirrorLogPath)"
            Show-DetailLog
            exit 1
        }
    }

    if ($Phase -eq 'configure' -or $Phase -eq 'all') {
        $rc = Invoke-ConfigurePhase
        if ($rc -ne 0) {
            Write-Host ''
            Write-Host "Files were installed, but configuration did not finish (configure exit code $rc)."
            Write-Host "You can re-run configuration later. Log: $(Get-MirrorLogPath)"
            Show-DetailLog
            exit 1
        }
    }

    Write-Host ''
    Write-Host '============================================'
    if ($Phase -eq 'bootstrap') {
        Write-Host ' Prerequisites installed and Mirror downloaded.'
    } elseif ($Phase -eq 'configure') {
        Write-Host ' Mirror Mind is configured and ready.'
    } else {
        Write-Host ' Mirror Mind is installed and configured.'
        Write-Host ' Use the "Mirror Mind" shortcut on your Desktop to start.'
    }
    Write-Host '============================================'
    Write-MirrorLog -Message "install.ps1 complete OK (Phase=$Phase)" | Out-Null
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
