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
# PS 5.1: 'Continue' avoids native commands (e.g. version probes) turning stderr
# output into terminating errors. Functions that probe native tools handle their
# own failures via try/catch and $LASTEXITCODE.
$ErrorActionPreference = 'Continue'

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

# ---------------------------------------------------------------------------
# PATH refresh
# ---------------------------------------------------------------------------

function Update-SessionPath {
    <#
    .SYNOPSIS
        Rebuild $env:PATH so freshly installed tools resolve in THIS process.
    .DESCRIPTION
        Rebuilds from the machine + user registry PATH and adds the well-known
        install dirs of the tools this installer places (Git, Node, npm globals,
        uv). Freshly installed tools are often not yet reflected in a running
        process's PATH, which is why a clone/uv sync/'memory init' can fail right
        after install - especially when the configure phase runs in a separate
        process that started before the tools existed.
    #>
    [CmdletBinding()]
    param()
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $extra = @(
        "${env:ProgramFiles}\Git\cmd",
        "${env:ProgramFiles}\nodejs",
        "$env:APPDATA\npm",
        (Join-Path $env:USERPROFILE '.local\bin'),
        (Join-Path $env:USERPROFILE '.cargo\bin'),
        "$env:LOCALAPPDATA\uv\bin",
        "$env:LOCALAPPDATA\Microsoft\WindowsApps"
    )
    $parts = @($machine, $user) + $extra
    $env:PATH = ($parts | Where-Object { $_ } | Select-Object -Unique) -join ';'
}

# ---------------------------------------------------------------------------
# Environment diagnostics (for future analysis)
# ---------------------------------------------------------------------------

function Write-MirrorEnvironmentBanner {
    <#
    .SYNOPSIS
        Record a machine/environment snapshot to the install log for later
        analysis. Never logs secrets (no OpenRouter key).
    .DESCRIPTION
        Captures OS/build, architecture, PowerShell version, winget availability,
        already-installed tool versions (git/node/uv/pi), the install target and
        repo/branch, and the resolved user. This is what makes a failed install
        diagnosable weeks later from the log file alone.
    #>
    [CmdletBinding()]
    param(
        [string]$InstallerVersion = '',
        [string]$InstallDir = '',
        [string]$RepoUrl = '',
        [string]$RepoBranch = '',
        [string]$MirrorUser = ''
    )
    $os = try { Get-CimInstance Win32_OperatingSystem -ErrorAction Stop } catch { $null }
    $osCaption = if ($os) { $os.Caption } else { [Environment]::OSVersion.VersionString }
    $osVersion = if ($os) { $os.Version } else { [Environment]::OSVersion.Version.ToString() }
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $psVer = $PSVersionTable.PSVersion.ToString()
    $winget = if (Test-CommandAvailable -Name 'winget') { 'available' } else { 'absent' }
    $curl = if (Test-CommandAvailable -Name 'curl.exe') { 'available' } else { 'absent' }

    $lines = @(
        '===== Mirror Mind install environment =====',
        ("installer version : {0}" -f $InstallerVersion),
        ("timestamp         : {0}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')),
        ("OS                : {0} ({1}, {2})" -f $osCaption, $osVersion, $arch),
        ("PowerShell        : {0}" -f $psVer),
        ("winget            : {0}" -f $winget),
        ("curl.exe          : {0}" -f $curl),
        ("download order    : {0}" -f ((Get-MirrorDownloadTransport) -join ' -> ')),
        ("git               : {0}" -f ((Get-CommandVersion -Name 'git'  -Arguments @('--version')) | ForEach-Object { $_ }) ),
        ("node              : {0}" -f (Get-CommandVersion -Name 'node' -Arguments @('--version'))),
        ("uv                : {0}" -f (Get-CommandVersion -Name 'uv'   -Arguments @('--version'))),
        ("pi                : {0}" -f (Get-CommandVersion -Name 'pi'   -Arguments @('--version'))),
        ("install dir       : {0}" -f $InstallDir),
        ("repo              : {0} ({1})" -f $RepoUrl, $RepoBranch),
        ("MIRROR_USER       : {0}" -f $MirrorUser),
        '==========================================='
    )
    foreach ($l in $lines) { Write-MirrorLog -Message $l | Out-Null }
}

# ---------------------------------------------------------------------------
# Resilient downloads
# ---------------------------------------------------------------------------

function Set-MirrorTls {
    <#
    .SYNOPSIS
        Force a modern TLS floor for .NET web requests on clean machines.
    .DESCRIPTION
        Sets TLS 1.2 (and 1.3 when the runtime supports it) EXPLICITLY rather
        than OR-ing onto the legacy default, which can leave SSL3/TLS1.0 enabled
        and cause "the connection was closed unexpectedly" during the handshake.
    #>
    [CmdletBinding()]
    param()
    try {
        $proto = [Net.SecurityProtocolType]::Tls12
        if ([enum]::GetNames([Net.SecurityProtocolType]) -contains 'Tls13') {
            $proto = $proto -bor [Net.SecurityProtocolType]::Tls13
        }
        [Net.ServicePointManager]::SecurityProtocol = $proto
    } catch { }
}

function Get-MirrorDownloadTransport {
    <#
    .SYNOPSIS
        Return the ordered list of available download transports.
    .DESCRIPTION
        Pure (no downloads): inspects the machine and returns the transports
        that exist, most robust first. curl.exe (Windows 10 1803+) handles TLS,
        redirects and flaky links best; BITS is a resilient second; the built-in
        Invoke-WebRequest is the always-present last resort.
    #>
    [CmdletBinding()]
    param()
    $names = @()
    if (Get-Command 'curl.exe' -ErrorAction SilentlyContinue) { $names += 'curl.exe' }
    if (Get-Command 'Start-BitsTransfer' -ErrorAction SilentlyContinue) { $names += 'BITS' }
    $names += 'Invoke-WebRequest'
    return $names
}

function Invoke-MirrorDownload {
    <#
    .SYNOPSIS
        Download a file resiliently: multiple transports x retry with backoff.
    .DESCRIPTION
        Tries curl.exe -> BITS -> Invoke-WebRequest, each wrapped in a retry
        loop with exponential backoff. Forces a modern TLS floor and validates
        the resulting file is present and at least -MinBytes in size before
        returning. Every attempt is logged. Throws only if ALL transports fail
        across ALL attempts.
    .OUTPUTS
        The destination path on success.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$Destination,
        [int]$MaxAttempts = 3,
        [long]$MinBytes = 1024
    )
    Set-MirrorTls
    $destDir = Split-Path -Parent $Destination
    if ($destDir -and -not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    $transports = Get-MirrorDownloadTransport
    $lastError = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        foreach ($t in $transports) {
            try {
                if (Test-Path -LiteralPath $Destination) {
                    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
                }
                Write-MirrorLog -Message "download via $t (attempt $attempt/$MaxAttempts): $Url" | Out-Null
                if ($t -eq 'curl.exe') {
                    $curl = (Get-Command 'curl.exe').Source
                    & $curl -L --fail --silent --show-error --retry 2 --retry-all-errors `
                        --connect-timeout 30 -o $Destination $Url
                    if ($LASTEXITCODE -ne 0) { throw "curl.exe exited with code $LASTEXITCODE" }
                } elseif ($t -eq 'BITS') {
                    Start-BitsTransfer -Source $Url -Destination $Destination -ErrorAction Stop
                } else {
                    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -ErrorAction Stop
                }
                if (-not (Test-Path -LiteralPath $Destination)) {
                    throw "$t reported success but no file was written"
                }
                $size = (Get-Item -LiteralPath $Destination).Length
                if ($size -lt $MinBytes) {
                    throw "$t produced a file that is too small ($size bytes, expected >= $MinBytes)"
                }
                Write-MirrorLog -Message "download OK via $t ($size bytes) -> $Destination" | Out-Null
                return $Destination
            } catch {
                $lastError = $_
                Write-MirrorLog -Level WARN -Message "download via $t failed: $($_.Exception.Message)" | Out-Null
            }
        }
        if ($attempt -lt $MaxAttempts) {
            $delay = [int][Math]::Pow(2, $attempt)  # 2s, 4s
            Write-MirrorLog -Message "retrying download in ${delay}s" | Out-Null
            Start-Sleep -Seconds $delay
        }
    }
    $msg = if ($lastError) { $lastError.Exception.Message } else { 'unknown error' }
    throw "All download transports failed for $Url after $MaxAttempts attempts. Last error: $msg"
}

function Resolve-GitHubLatestAsset {
    <#
    .SYNOPSIS
        Resolve a release asset's direct download URL via the GitHub API.
    .DESCRIPTION
        Queries api.github.com for the latest release of <Repo> and returns the
        first asset whose name matches <Pattern>. This API-resolved URL is the
        technique proven to work in Windows Sandbox, unlike the bare
        'releases/latest/download/...' redirect URL.
    .OUTPUTS
        pscustomobject: Name, Url, Size
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Repo,
        [Parameter(Mandatory)][string]$Pattern
    )
    Set-MirrorTls
    $api = "https://api.github.com/repos/$Repo/releases/latest"
    # GitHub requires a User-Agent header or it returns 403.
    $headers = @{ 'User-Agent' = 'MirrorMind-Installer' }
    $release = Invoke-RestMethod -Uri $api -Headers $headers -UseBasicParsing -ErrorAction Stop
    $asset = $release.assets | Where-Object { $_.name -match $Pattern } | Select-Object -First 1
    if (-not $asset) {
        throw "No asset matching '$Pattern' in the latest release of $Repo"
    }
    return [pscustomobject]@{
        Name = $asset.name
        Url  = $asset.browser_download_url
        Size = $asset.size
    }
}

Export-ModuleMember -Function `
    Get-MirrorLogPath, Write-MirrorLog, `
    New-FriendlyError, Format-FriendlyError, `
    Test-CommandAvailable, ConvertTo-VersionString, Compare-MirrorVersion, `
    Get-CommandVersion, Test-MirrorDependency, Invoke-MirrorStep, `
    Set-MirrorTls, Get-MirrorDownloadTransport, Invoke-MirrorDownload, `
    Resolve-GitHubLatestAsset, Write-MirrorEnvironmentBanner, Update-SessionPath
