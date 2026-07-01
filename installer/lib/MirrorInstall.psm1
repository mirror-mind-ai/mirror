<#
.SYNOPSIS
    Shared helpers for the Mirror Mind Windows installer.

.DESCRIPTION
    Pure, testable helpers used by bootstrap.ps1, configure.ps1 and the
    Inno Setup wrapper. Every function is designed to be safe to import and
    unit-test without side effects unless explicitly invoked.

    Design goals:
      * Detection and version parsing are pure functions.
      * All user-facing failures go through New-FriendlyError so the installer
        never shows a raw stack trace or PowerShell exception to the user.
      * Logging is centralized and redirectable (MIRROR_INSTALL_LOG) so tests
        can capture output in a temp file.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

function Get-MirrorLogPath {
    <#
    .SYNOPSIS
        Resolve the installer log file path.
    .DESCRIPTION
        Honors the MIRROR_INSTALL_LOG environment variable (used by tests and
        the Inno Setup wrapper). Falls back to %TEMP%\mirror-install.log.
    #>
    if ($env:MIRROR_INSTALL_LOG) {
        return $env:MIRROR_INSTALL_LOG
    }
    $tempDir = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
    return (Join-Path $tempDir 'mirror-install.log')
}

function Write-MirrorLog {
    <#
    .SYNOPSIS
        Append a timestamped line to the installer log.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO', 'WARN', 'ERROR', 'STEP')][string]$Level = 'INFO'
    )
    $logPath = Get-MirrorLogPath
    $logDir = Split-Path -Parent $logPath
    if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "[$stamp] [$Level] $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    return $line
}

# ---------------------------------------------------------------------------
# Friendly errors
# ---------------------------------------------------------------------------

function New-FriendlyError {
    <#
    .SYNOPSIS
        Build a structured, user-friendly error object.
    .DESCRIPTION
        Never surface a raw exception to the user. Every failure is expressed
        as a code + plain message + probable cause + concrete suggested action.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Code,
        [Parameter(Mandatory)][string]$Message,
        [string]$Cause = '',
        [string]$Action = '',
        [string]$Detail = ''
    )
    return [pscustomobject]@{
        Code    = $Code
        Message = $Message
        Cause   = $Cause
        Action  = $Action
        Detail  = $Detail
    }
}

function Format-FriendlyError {
    <#
    .SYNOPSIS
        Render a friendly error object as a readable multi-line block.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory, ValueFromPipeline)]$FriendlyError)
    process {
        $lines = @()
        $lines += ''
        $lines += "  X  Mirror Mind installation could not continue ($($FriendlyError.Code))"
        $lines += "     $($FriendlyError.Message)"
        if ($FriendlyError.Cause) {
            $lines += ''
            $lines += "     Likely cause: $($FriendlyError.Cause)"
        }
        if ($FriendlyError.Action) {
            $lines += ''
            $lines += "     What to do:   $($FriendlyError.Action)"
        }
        $lines += ''
        $lines += "     A full log is available at: $(Get-MirrorLogPath)"
        $lines += ''
        return ($lines -join [Environment]::NewLine)
    }
}

# ---------------------------------------------------------------------------
# Command / version detection (pure)
# ---------------------------------------------------------------------------

function Test-CommandAvailable {
    <#
    .SYNOPSIS
        Return $true when an executable is resolvable on PATH.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Name)
    $cmd = Get-Command -Name $Name -ErrorAction SilentlyContinue
    return [bool]$cmd
}

function ConvertTo-VersionString {
    <#
    .SYNOPSIS
        Extract the first dotted numeric version from arbitrary CLI output.
    .DESCRIPTION
        Tolerant parser. "git version 2.54.0.windows.1" -> "2.54.0",
        "v24.16.0" -> "24.16.0", "uv 0.11.15 (...)" -> "0.11.15".
        Returns $null when no version-like token is found.
    #>
    [CmdletBinding()]
    param([string]$Text)
    if (-not $Text) { return $null }
    $match = [regex]::Match($Text, '(\d+)\.(\d+)(?:\.(\d+))?')
    if ($match.Success) {
        $major = $match.Groups[1].Value
        $minor = $match.Groups[2].Value
        $patch = if ($match.Groups[3].Success) { $match.Groups[3].Value } else { '0' }
        return "$major.$minor.$patch"
    }
    # Tolerate a bare major version (e.g. a '18' minimum constant). CLI output is
    # always dotted, so this only helps our own configured minimums, not parsing.
    if ($Text.Trim() -match '^\d+$') {
        return "$($Text.Trim()).0.0"
    }
    return $null
}

function Compare-MirrorVersion {
    <#
    .SYNOPSIS
        Return $true when Current >= Minimum (semantic-ish, tolerant).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Current,
        [Parameter(Mandatory)][string]$Minimum
    )
    $c = ConvertTo-VersionString $Current
    $m = ConvertTo-VersionString $Minimum
    if (-not $c -or -not $m) { return $false }
    try {
        return ([version]$c) -ge ([version]$m)
    } catch {
        return $false
    }
}

function Get-CommandVersion {
    <#
    .SYNOPSIS
        Run "<name> <args>" and return a normalized version string, or $null.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [string[]]$Arguments = @('--version')
    )
    if (-not (Test-CommandAvailable -Name $Name)) { return $null }
    try {
        $raw = & $Name @Arguments 2>&1 | Out-String
    } catch {
        return $null
    }
    return (ConvertTo-VersionString $raw)
}

function Test-MirrorDependency {
    <#
    .SYNOPSIS
        Detect a dependency and report install status against a minimum version.
    .OUTPUTS
        pscustomobject: Name, Command, Installed, Version, MinVersion,
                        Satisfied, Reason
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Command,
        [string[]]$VersionArgs = @('--version'),
        [string]$MinVersion = ''
    )
    $installed = Test-CommandAvailable -Name $Command
    $version = if ($installed) { Get-CommandVersion -Name $Command -Arguments $VersionArgs } else { $null }

    $satisfied = $false
    $reason = ''
    if (-not $installed) {
        $reason = "'$Command' was not found on PATH"
    } elseif ($MinVersion -and -not $version) {
        $reason = "installed but version could not be determined (minimum $MinVersion)"
    } elseif ($MinVersion -and -not (Compare-MirrorVersion -Current $version -Minimum $MinVersion)) {
        $reason = "installed version $version is older than the required $MinVersion"
    } else {
        $satisfied = $true
        $reason = if ($version) { "found version $version" } else { 'found' }
    }

    return [pscustomobject]@{
        Name       = $Name
        Command    = $Command
        Installed  = $installed
        Version    = $version
        MinVersion = $MinVersion
        Satisfied  = $satisfied
        Reason     = $reason
    }
}

# ---------------------------------------------------------------------------
# Step runner
# ---------------------------------------------------------------------------

function Invoke-MirrorStep {
    <#
    .SYNOPSIS
        Run a named step, logging start/finish and converting any exception
        into a friendly error that is re-thrown for the caller to render.
    .PARAMETER OnErrorFriendly
        Optional scriptblock receiving the caught exception and returning a
        friendly-error object (from New-FriendlyError). When omitted a generic
        friendly error is produced.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Action,
        [scriptblock]$OnErrorFriendly
    )
    Write-MirrorLog -Level STEP -Message "BEGIN $Name" | Out-Null
    try {
        $result = & $Action
        Write-MirrorLog -Level STEP -Message "OK    $Name" | Out-Null
        return $result
    } catch {
        $ex = $_
        Write-MirrorLog -Level ERROR -Message "FAIL  $Name :: $($ex.Exception.Message)" | Out-Null
        if ($OnErrorFriendly) {
            $friendly = & $OnErrorFriendly $ex
        } else {
            $friendly = New-FriendlyError -Code 'STEP_FAILED' `
                -Message "The step '$Name' did not complete." `
                -Cause $ex.Exception.Message `
                -Action 'Check your internet connection and re-run the installer. If it persists, share the log file.'
        }
        throw ([pscustomobject]@{ IsFriendly = $true; Friendly = $friendly })
    }
}

Export-ModuleMember -Function `
    Get-MirrorLogPath, Write-MirrorLog, `
    New-FriendlyError, Format-FriendlyError, `
    Test-CommandAvailable, ConvertTo-VersionString, Compare-MirrorVersion, `
    Get-CommandVersion, Test-MirrorDependency, Invoke-MirrorStep
