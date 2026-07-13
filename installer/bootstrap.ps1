<#
.SYNOPSIS
    Detect and silently install Mirror Mind prerequisites, then clone/sync the
    Mirror repository.

.DESCRIPTION
    Prerequisites handled: Git, Node.js LTS, uv, Pi (@earendil-works/coding-agent).
    Strategy per dependency: detect -> (if missing/outdated) install silently via
    winget when available, else a direct silent installer -> re-detect.

    The Mirror product itself is a git clone (required so `runtime update` keeps
    working) followed by `uv sync`.

.PARAMETER InstallDir
    Target directory for the Mirror clone. Default: %LOCALAPPDATA%\Programs\MirrorMind.

.PARAMETER RepoUrl
    Git URL to clone. Default: https://github.com/mirror-mind-ai/mirror.git

.PARAMETER Branch
    Branch to track. Default: stable (the release channel the Mirror runtime
    updater fast-forwards from). Cloning this branch is what keeps
    'memory runtime update' working in place without a reinstall.

.PARAMETER DetectOnly
    Only report dependency status; never install or clone. Safe on any machine.

.PARAMETER SkipDeps
    Skip dependency installation (assume prerequisites are present); still clone/sync.

.OUTPUTS
    Writes a status report to the console and the installer log. Exits non-zero
    with a friendly error on failure.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\MirrorMind'),
    [string]$RepoUrl = 'https://github.com/mirror-mind-ai/mirror.git',
    [string]$Branch = 'stable',
    [switch]$DetectOnly,
    [switch]$SkipDeps
)

Set-StrictMode -Version Latest
# PS 5.1: keep 'Continue' so a native command writing to stderr (git/npm/uv print
# progress there on success) does not raise a spurious terminating error. Native
# failures are detected explicitly via $LASTEXITCODE / Start-Process ExitCode, and
# cmdlets that must fail hard get an explicit -ErrorAction Stop.
$ErrorActionPreference = 'Continue'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Visible, immediate marker so the wizard transcript shows the bootstrap started,
# even if something fails during module import on a clean machine.
Write-Host 'Mirror bootstrap: initializing...'

# Early heartbeat to the log BEFORE importing the module, so even an import or
# parse failure leaves a trace on a clean machine.
try {
    $__log = if ($env:MIRROR_INSTALL_LOG) { $env:MIRROR_INSTALL_LOG } else { Join-Path $env:TEMP 'mirror-install.log' }
    Add-Content -LiteralPath $__log -Value ("[{0}] [STEP] bootstrap.ps1 starting (here=$here)" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) -Encoding UTF8
} catch { }

try {
    Import-Module (Join-Path $here 'lib\MirrorInstall.psm1') -Force
} catch {
    Write-Host "Mirror bootstrap: FAILED to load installer helpers from '$here\lib\MirrorInstall.psm1'"
    Write-Host "  $($_.Exception.Message)"
    exit 1
}
Write-Host 'Mirror bootstrap: helpers loaded.'

# Clean Windows machines may default to an older TLS; force TLS 1.2 for the
# GitHub/nodejs/astral downloads below.
try {
    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

# ---------------------------------------------------------------------------
# Dependency catalog
# ---------------------------------------------------------------------------
# Each entry: friendly Name, PATH Command, VersionArgs, MinVersion, winget Id,
# and a Fallback scriptblock that installs silently without winget.

$script:Dependencies = @(
    [pscustomobject]@{
        Name        = 'Git'
        Command     = 'git'
        VersionArgs = @('--version')
        MinVersion  = '2.30.0'
        WingetId    = 'Git.Git'
        Fallback    = { Install-Git }
    },
    [pscustomobject]@{
        Name        = 'Node.js LTS'
        Command     = 'node'
        VersionArgs = @('--version')
        MinVersion  = '18.0.0'
        WingetId    = 'OpenJS.NodeJS.LTS'
        Fallback    = { Install-Node }
    },
    [pscustomobject]@{
        Name        = 'uv'
        Command     = 'uv'
        VersionArgs = @('--version')
        MinVersion  = '0.4.0'
        WingetId    = 'astral-sh.uv'
        Fallback    = { Install-Uv }
    }
)

# Pi is installed via npm (needs Node first), handled separately after Node.
# The npm package that provides the `pi` binary is @earendil-works/pi-coding-agent
# (the earlier @mariozechner/pi-coding-agent name is legacy).
$script:PiPackage = '@earendil-works/pi-coding-agent'
$script:PiCommand = 'pi'
$script:PiMinVersion = '0.1.0'

# ---------------------------------------------------------------------------
# Install helpers
# ---------------------------------------------------------------------------

function Test-WingetAvailable {
    return (Test-CommandAvailable -Name 'winget')
}

function Install-ViaWinget {
    param([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$Name)
    Write-MirrorLog -Message "winget install $Id" | Out-Null
    $wingetArgs = @('install', '--id', $Id, '--exact', '--silent',
        '--accept-package-agreements', '--accept-source-agreements',
        '--disable-interactivity')
    $p = Start-Process -FilePath 'winget' -ArgumentList $wingetArgs -Wait -PassThru -NoNewWindow
    # winget exit codes: 0 ok; -1978335189 (0x8A15002B) already installed / no upgrade.
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne -1978335189) {
        throw "winget install '$Id' failed with exit code $($p.ExitCode)"
    }
}

function Install-FromDownload {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Url,
        [string[]]$SilentArgs = @(),
        [long]$MinBytes = 1048576
    )
    $dest = Join-Path $env:TEMP ("mirror-dep-{0}.exe" -f ([regex]::Replace($Name, '\W', '')))
    Write-MirrorLog -Message "download $Name from $Url" | Out-Null
    # Resilient transport (curl.exe -> BITS -> Invoke-WebRequest, retry + backoff).
    Invoke-MirrorDownload -Url $Url -Destination $dest -MinBytes $MinBytes | Out-Null
    $p = Start-Process -FilePath $dest -ArgumentList $SilentArgs -Wait -PassThru
    if ($p.ExitCode -ne 0) {
        throw "$Name installer exited with code $($p.ExitCode)"
    }
}

function Install-Git {
    <# Silent Git for Windows install without winget. Primary path resolves the
       installer through the GitHub API (browser_download_url) - the technique
       proven to work in Windows Sandbox. Falls back to the bare redirect URL
       only if the API resolution itself fails. #>
    $dest = Join-Path $env:TEMP 'mirror-dep-Git.exe'
    $silent = @('/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-')
    try {
        $asset = Resolve-GitHubLatestAsset -Repo 'git-for-windows/git' -Pattern 'Git-.*-64-bit\.exe$'
        Write-MirrorLog -Message "Git latest asset: $($asset.Name)" | Out-Null
        Invoke-MirrorDownload -Url $asset.Url -Destination $dest -MinBytes 1048576 | Out-Null
    } catch {
        Write-MirrorLog -Level WARN -Message "API-resolved Git download failed ($($_.Exception.Message)); trying redirect URL" | Out-Null
        Invoke-MirrorDownload `
            -Url 'https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe' `
            -Destination $dest -MinBytes 1048576 | Out-Null
    }
    $p = Start-Process -FilePath $dest -ArgumentList $silent -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Git installer exited with code $($p.ExitCode)" }
    Update-SessionPath
}

function Install-Node {
    <# Silent Node.js LTS install via the official MSI (works without winget). #>
    Write-MirrorLog -Message 'install Node.js LTS via MSI' | Out-Null
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing -ErrorAction Stop
    $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
    if (-not $lts) { throw 'Could not determine the latest Node.js LTS version.' }
    $ver = $lts.version
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
    $url = "https://nodejs.org/dist/$ver/node-$ver-$arch.msi"
    $dest = Join-Path $env:TEMP "node-$ver-$arch.msi"
    Write-MirrorLog -Message "download Node.js $ver ($arch) from $url" | Out-Null
    Invoke-MirrorDownload -Url $url -Destination $dest -MinBytes 1048576 | Out-Null
    $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$dest`"", '/qn', '/norestart') -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Node.js MSI install failed ($($p.ExitCode))" }
    Update-SessionPath
}

function Install-Uv {
    Write-MirrorLog -Message 'install uv via official script' | Out-Null
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `
        "irm https://astral.sh/uv/install.ps1 | iex" | Out-Null
    Update-SessionPath
}

# Update-SessionPath now lives in MirrorInstall.psm1 (shared with configure.ps1,
# whose separate process must also pick up freshly installed tools like uv).

function Install-Dependency {
    param([Parameter(Mandatory)][pscustomobject]$Dep)
    Invoke-MirrorStep -Name "install $($Dep.Name)" -Action {
        if (Test-WingetAvailable) {
            try {
                Install-ViaWinget -Id $Dep.WingetId -Name $Dep.Name
                Update-SessionPath
                return
            } catch {
                Write-MirrorLog -Level WARN -Message "winget failed for $($Dep.Name): $($_.Exception.Message); trying fallback" | Out-Null
            }
        }
        & $Dep.Fallback
        Update-SessionPath
    } -OnErrorFriendly {
        param($ex)
        New-FriendlyError -Code 'DEP_INSTALL_FAILED' `
            -Message "Could not install $($Dep.Name)." `
            -Cause $ex.Exception.Message `
            -Action "Ensure you are online. You can also install $($Dep.Name) manually, then re-run this installer."
    }
}

function Ensure-Dependency {
    param([Parameter(Mandatory)][pscustomobject]$Dep)
    $status = Test-MirrorDependency -Name $Dep.Name -Command $Dep.Command `
        -VersionArgs $Dep.VersionArgs -MinVersion $Dep.MinVersion
    if ($status.Satisfied) {
        Write-Host ("  [ok]      {0,-14} {1}" -f $Dep.Name, $status.Reason)
        Write-MirrorLog -Message "$($Dep.Name) satisfied: $($status.Reason)" | Out-Null
        return $status
    }
    if ($DetectOnly) {
        Write-Host ("  [missing] {0,-14} {1}" -f $Dep.Name, $status.Reason) -ForegroundColor Yellow
        return $status
    }
    Write-Host ("  [install] {0,-14} {1}" -f $Dep.Name, $status.Reason) -ForegroundColor Cyan
    Install-Dependency -Dep $Dep
    $after = Test-MirrorDependency -Name $Dep.Name -Command $Dep.Command `
        -VersionArgs $Dep.VersionArgs -MinVersion $Dep.MinVersion
    if (-not $after.Satisfied) {
        throw ([pscustomobject]@{ IsFriendly = $true; Friendly = (New-FriendlyError `
            -Code 'DEP_STILL_MISSING' `
            -Message "$($Dep.Name) is still not available after installation." `
            -Cause $after.Reason `
            -Action 'Close and reopen the installer so PATH refreshes, or install the dependency manually.') })
    }
    Write-Host ("  [ok]      {0,-14} {1}" -f $Dep.Name, $after.Reason)
    return $after
}

function Ensure-Pi {
    $status = Test-MirrorDependency -Name 'Pi' -Command $script:PiCommand -MinVersion $script:PiMinVersion
    if ($status.Satisfied) {
        Write-Host ("  [ok]      {0,-14} {1}" -f 'Pi', $status.Reason)
        return $status
    }
    if ($DetectOnly) {
        Write-Host ("  [missing] {0,-14} {1}" -f 'Pi', $status.Reason) -ForegroundColor Yellow
        return $status
    }
    Write-Host ("  [install] {0,-14} {1}" -f 'Pi', 'installing via npm') -ForegroundColor Cyan
    Invoke-MirrorStep -Name 'install Pi (npm global)' -Action {
        # npm on Windows is a shim (npm.cmd / extensionless script), not an .exe:
        # Start-Process -FilePath 'npm' fails with "%1 is not a valid Win32
        # application". Run it through cmd.exe so PATHEXT resolves npm.cmd, while
        # still capturing the real exit code.
        # --ignore-scripts avoids native postinstall/build steps that are
        # unreliable on a fresh Windows; npm still creates the `pi` bin shim.
        $npmArgs = @('/c', 'npm', 'install', '-g', '--ignore-scripts', $script:PiPackage)
        $p = Start-Process -FilePath $env:ComSpec -ArgumentList $npmArgs -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -ne 0) { throw "npm install -g $($script:PiPackage) failed ($($p.ExitCode))" }
        Update-SessionPath
    } -OnErrorFriendly {
        param($ex)
        New-FriendlyError -Code 'PI_INSTALL_FAILED' `
            -Message 'Could not install Pi (the recommended Mirror harness).' `
            -Cause $ex.Exception.Message `
            -Action 'Confirm Node.js/npm are installed and you are online, then re-run the installer.'
    }
    return (Test-MirrorDependency -Name 'Pi' -Command $script:PiCommand -MinVersion $script:PiMinVersion)
}

function Sync-MirrorRepo {
    param([Parameter(Mandatory)][string]$Dir)
    Invoke-MirrorStep -Name 'clone/sync Mirror repository' -Action {
        # Explicit refspec so 'origin/<Branch>' is created even when an older
        # clone was configured single-branch on a different branch (e.g. main).
        $refspec = "+refs/heads/$Branch`:refs/remotes/origin/$Branch"
        if (Test-Path -LiteralPath (Join-Path $Dir '.git')) {
            # Existing clone: fetch the latest tip of the release branch and
            # fast-forward the working tree onto it so a reinstall always lands
            # on the newest stable (untracked files like .env are preserved).
            Write-MirrorLog -Message "existing clone at $Dir; updating to latest '$Branch'" | Out-Null
            & git -C $Dir fetch --depth 1 origin $refspec
            if ($LASTEXITCODE -ne 0) { throw "git fetch failed ($LASTEXITCODE)" }
            & git -C $Dir checkout -B $Branch "origin/$Branch"
            if ($LASTEXITCODE -ne 0) { throw "git checkout '$Branch' failed ($LASTEXITCODE)" }
            & git -C $Dir reset --hard "origin/$Branch"
            if ($LASTEXITCODE -ne 0) { throw "git reset to origin/$Branch failed ($LASTEXITCODE)" }
        } else {
            if (Test-Path -LiteralPath $Dir) {
                $items = Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue
                if ($items) { throw "Install directory '$Dir' exists and is not empty." }
            }
            # Shallow, single-branch clone of the release branch: a light,
            # install-like footprint that still keeps .git so the runtime
            # updater can fetch + fast-forward in place.
            Write-MirrorLog -Message "cloning $RepoUrl ($Branch, shallow) into $Dir" | Out-Null
            & git clone --branch $Branch --single-branch --depth 1 $RepoUrl $Dir
            if ($LASTEXITCODE -ne 0) {
                # Roll back a partial/corrupt clone so a re-run starts clean.
                if (Test-Path -LiteralPath (Join-Path $Dir '.git')) {
                    Remove-Item -Recurse -Force -LiteralPath $Dir -ErrorAction SilentlyContinue
                }
                throw "git clone failed ($LASTEXITCODE)"
            }
        }
        Write-MirrorLog -Message "uv sync in $Dir" | Out-Null
        Push-Location $Dir
        try {
            & uv sync
            if ($LASTEXITCODE -ne 0) { throw "uv sync failed ($LASTEXITCODE)" }
        } finally {
            Pop-Location
        }
    } -OnErrorFriendly {
        param($ex)
        New-FriendlyError -Code 'REPO_SYNC_FAILED' `
            -Message 'Could not download or set up the Mirror files.' `
            -Cause $ex.Exception.Message `
            -Action 'Check your internet connection and that the install folder is writable, then re-run the installer.'
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

function Invoke-Bootstrap {
    Write-Host ''
    Write-Host 'Mirror Mind - checking prerequisites' -ForegroundColor White
    Write-Host '------------------------------------'
    Write-MirrorLog -Message "bootstrap start (DetectOnly=$DetectOnly SkipDeps=$SkipDeps InstallDir=$InstallDir)" | Out-Null

    if (-not $SkipDeps) {
        foreach ($dep in $script:Dependencies) { Ensure-Dependency -Dep $dep | Out-Null }
        Ensure-Pi | Out-Null
    } else {
        Write-Host '  (skipping dependency checks by request)'
    }

    if ($DetectOnly) {
        Write-Host ''
        Write-Host 'Detection only - no changes made.' -ForegroundColor White
        return
    }

    Write-Host ''
    Write-Host 'Setting up Mirror files' -ForegroundColor White
    Write-Host '-----------------------'
    Sync-MirrorRepo -Dir $InstallDir
    Write-Host ("  [ok]      Mirror installed at {0}" -f $InstallDir)
    Write-MirrorLog -Message 'bootstrap complete' | Out-Null
}

try {
    Invoke-Bootstrap
    exit 0
} catch {
    $obj = $_.TargetObject
    if ($obj -and ($obj.PSObject.Properties.Name -contains 'IsFriendly') -and $obj.IsFriendly) {
        Write-Host (Format-FriendlyError $obj.Friendly) -ForegroundColor Red
    } else {
        $fe = New-FriendlyError -Code 'UNEXPECTED' -Message 'The installer hit an unexpected problem.' `
            -Cause $_.Exception.Message `
            -Action 'Re-run the installer. If it persists, share the log file below with support.'
        Write-Host (Format-FriendlyError $fe) -ForegroundColor Red
    }
    exit 1
}
