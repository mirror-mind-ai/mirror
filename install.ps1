<#
.SYNOPSIS
    Mirror Mind Windows Installer

.DESCRIPTION
    Installs Mirror Mind and all dependencies on Windows 10/11.
    Sequence: Git -> Node.js -> uv -> Pi -> upstream clone -> adapter layer -> onboarding

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1

.EXAMPLE
    # Non-interactive with pre-set values
    powershell -ExecutionPolicy Bypass -File install.ps1 -UserName "rodrigo" -ApiKey "sk-or-..."
#>

param(
    [string]$UserName = "",
    [string]$ApiKey = "",
    [string]$InstallDir = "$env:LOCALAPPDATA\MirrorMind",
    [switch]$SkipDeps,
    [switch]$Unattended
)

$ErrorActionPreference = "Stop"
$script:StepsCompleted = @()
$script:LogFile = ""

# --- Logging ---

function Initialize-Log {
    $logDir = Join-Path $InstallDir "logs"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $script:LogFile = Join-Path $logDir "install-$timestamp.log"
    New-Item -ItemType File -Path $script:LogFile -Force | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts [$Level] $Message"
    if ($script:LogFile -and (Test-Path $script:LogFile)) {
        Add-Content -Path $script:LogFile -Value $line -Encoding utf8
    }
    $color = switch ($Level) {
        "INFO"  { "White" }
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "STEP"  { "Cyan" }
        default { "White" }
    }
    Write-Host $line -ForegroundColor $color
}

# --- Rollback ---

function Invoke-Rollback {
    Write-Log "Installation failed. Rolling back..." "WARN"
    foreach ($step in ($script:StepsCompleted | Sort-Object -Descending)) {
        switch ($step) {
            "repo" {
                $repoDir = Join-Path $InstallDir "repo"
                if (Test-Path $repoDir) {
                    Write-Log "Removing cloned repo at $repoDir" "WARN"
                    Remove-Item -Recurse -Force $repoDir -ErrorAction SilentlyContinue
                }
            }
            "adapter" {
                $adapterDir = Join-Path $InstallDir "adapter"
                if (Test-Path $adapterDir) {
                    Write-Log "Removing adapter at $adapterDir" "WARN"
                    Remove-Item -Recurse -Force $adapterDir -ErrorAction SilentlyContinue
                }
            }
            "env" {
                Write-Log "Removing PYTHONSTARTUP env var" "WARN"
                [Environment]::SetEnvironmentVariable("PYTHONSTARTUP", $null, "User")
            }
            "envfile" {
                $envFile = Join-Path $InstallDir "repo" ".env"
                if (Test-Path $envFile) {
                    Remove-Item -Force $envFile -ErrorAction SilentlyContinue
                }
            }
        }
    }
    Write-Log "Rollback complete. Check the log at $script:LogFile" "WARN"
}

# --- Dependency checks ---

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Winget {
    try {
        $out = & winget --version 2>&1
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Refresh-PathEnv {
    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machinePath;$userPath"
}

function Install-Dependency {
    param(
        [string]$Name,
        [string]$WingetId,
        [string]$TestCommand
    )
    if (Test-Command $TestCommand) {
        $ver = & $TestCommand --version 2>&1
        Write-Log "$Name already installed: $ver" "OK"
        return $true
    }

    # Try winget first
    if (Test-Winget) {
        Write-Log "Installing $Name via winget ($WingetId)..." "STEP"
        try {
            & winget install --id $WingetId -e --silent --accept-package-agreements --accept-source-agreements 2>&1 | ForEach-Object { Write-Log $_ }
            Refresh-PathEnv

            if (Test-Command $TestCommand) {
                $ver = & $TestCommand --version 2>&1
                Write-Log "$Name installed successfully: $ver" "OK"
                return $true
            } else {
                Write-Log "$Name installed but not found in PATH. A restart may be needed." "WARN"
                return $true
            }
        } catch {
            Write-Log "winget install of $Name failed: $_ - trying direct download..." "WARN"
        }
    } else {
        Write-Log "winget not available, using direct download for $Name..." "WARN"
    }

    # Fallback: direct download
    return Install-DirectDownload -Name $Name -TestCommand $TestCommand
}

function Install-DirectDownload {
    param(
        [string]$Name,
        [string]$TestCommand
    )

    $tempDir = Join-Path $env:TEMP "MirrorMindInstall"
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }

    try {
        switch ($Name) {
            "Git" {
                return Install-GitDirect -TempDir $tempDir
            }
            "Node.js" {
                return Install-NodeDirect -TempDir $tempDir
            }
            default {
                Write-Log "No direct download available for $Name" "ERROR"
                return $false
            }
        }
    } catch {
        Write-Log "Direct download of $Name failed: $_" "ERROR"
        return $false
    }
}

function Install-GitDirect {
    param([string]$TempDir)

    Write-Log "Downloading Git installer..." "STEP"

    # Query GitHub API for latest Git for Windows release
    $releaseUrl = "https://api.github.com/repos/git-for-windows/git/releases/latest"
    $release = Invoke-RestMethod -Uri $releaseUrl -UseBasicParsing
    $asset = $release.assets | Where-Object { $_.name -match "Git-.*-64-bit\.exe$" } | Select-Object -First 1

    if (-not $asset) {
        Write-Log "Could not find Git installer in latest release" "ERROR"
        return $false
    }

    $installerPath = Join-Path $TempDir $asset.name
    $dlSize = [math]::Round($asset.size / 1MB, 1)
    $dlMsg = "Downloading " + $asset.name + " (" + $dlSize + " MB)..."
    Write-Log $dlMsg "STEP"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath -UseBasicParsing

    Write-Log "Running Git installer (silent)..." "STEP"
    $gitArgs = "/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/CLOSEAPPLICATIONS", "/RESTARTAPPLICATIONS", "/COMPONENTS=ext,ext\shellhere,ext\guihere,gitlfs,assoc,assoc_sh,windowsterminal"
    Start-Process -FilePath $installerPath -ArgumentList $gitArgs -Wait -NoNewWindow

    Refresh-PathEnv
    # Git installs to Program Files - add to PATH for current session
    $gitBin = "C:\Program Files\Git\cmd"
    if ((Test-Path $gitBin) -and ($env:PATH -notlike "*$gitBin*")) {
        $env:PATH = "$gitBin;$env:PATH"
    }

    if (Test-Command "git") {
        $ver = & git --version 2>&1
        Write-Log "Git installed successfully: $ver" "OK"
        return $true
    } else {
        Write-Log "Git installed but not found in PATH" "WARN"
        return $true
    }
}

function Install-NodeDirect {
    param([string]$TempDir)

    Write-Log "Downloading Node.js LTS installer..." "STEP"

    # Get latest LTS version from Node.js
    $versions = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
    $lts = $versions | Where-Object { $_.lts -ne $false } | Select-Object -First 1

    if (-not $lts) {
        Write-Log "Could not determine latest Node.js LTS version" "ERROR"
        return $false
    }

    $nodeVersion = $lts.version
    $msiName = "node-$nodeVersion-x64.msi"
    $downloadUrl = "https://nodejs.org/dist/$nodeVersion/$msiName"
    $msiPath = Join-Path $TempDir $msiName

    Write-Log "Downloading Node.js $nodeVersion..." "STEP"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $msiPath -UseBasicParsing

    Write-Log "Running Node.js installer (silent)..." "STEP"
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $msiPath, "/qn", "/norestart" -Wait -NoNewWindow

    Refresh-PathEnv
    # Node.js installs to Program Files - add to PATH for current session
    $nodeBin = "C:\Program Files\nodejs"
    if ((Test-Path $nodeBin) -and ($env:PATH -notlike "*$nodeBin*")) {
        $env:PATH = "$nodeBin;$env:PATH"
    }

    if (Test-Command "node") {
        $ver = & node --version 2>&1
        Write-Log "Node.js installed successfully: $ver" "OK"
        return $true
    } else {
        Write-Log "Node.js installed but not found in PATH" "WARN"
        return $true
    }
}

function Install-Uv {
    if (Test-Command "uv") {
        $ver = & uv --version 2>&1
        Write-Log "uv already installed: $ver" "OK"
        return $true
    }

    Write-Log "Installing uv (Python manager)..." "STEP"
    try {
        Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression 2>&1 | ForEach-Object { Write-Log $_ }
        # Add uv to PATH for current session (location varies by version)
        $uvPaths = @(
            (Join-Path $env:USERPROFILE ".cargo\bin"),
            (Join-Path $env:USERPROFILE ".local\bin"),
            (Join-Path $env:LOCALAPPDATA "uv\bin")
        )
        foreach ($uvBin in $uvPaths) {
            if ((Test-Path $uvBin) -and ($env:PATH -notlike "*$uvBin*")) {
                $env:PATH = "$uvBin;$env:PATH"
            }
        }
        if (Test-Command "uv") {
            $ver = & uv --version 2>&1
            Write-Log "uv installed: $ver" "OK"
            return $true
        } else {
            Write-Log "uv installed but not found in PATH" "WARN"
            return $true
        }
    } catch {
        Write-Log "Failed to install uv: $_" "ERROR"
        return $false
    }
}

function Install-Pi {
    if (Test-Command "pi") {
        Write-Log "Pi already installed" "OK"
        return $true
    }

    Write-Log "Installing Pi coding agent via npm..." "STEP"
    try {
        & npm install -g --ignore-scripts "@mariozechner/pi-coding-agent" 2>&1 | ForEach-Object { Write-Log $_ }
        if (Test-Command "pi") {
            Write-Log "Pi installed successfully" "OK"
            return $true
        } else {
            Write-Log "Pi installed but not found in PATH" "WARN"
            return $true
        }
    } catch {
        Write-Log "Failed to install Pi: $_" "ERROR"
        return $false
    }
}

# --- Main installation steps ---

function Step-CloneUpstream {
    $repoDir = Join-Path $InstallDir "repo"

    if (Test-Path (Join-Path $repoDir ".git")) {
        Write-Log "Upstream repo already cloned at $repoDir" "OK"
        $script:StepsCompleted += "repo"
        return $true
    }

    Write-Log "Cloning Mirror Mind upstream..." "STEP"
    try {
        # Clone with no-checkout to avoid Windows-invalid paths (e.g. mm:backup)
        & git clone --no-checkout https://github.com/mirror-mind-ai/mirror $repoDir 2>&1 | ForEach-Object { Write-Log $_ }

        # Configure sparse-checkout to exclude paths with : (illegal on Windows)
        Set-Location $repoDir
        & git sparse-checkout init --no-cone 2>&1 | ForEach-Object { Write-Log $_ }
        $sparseContent = "/*`n!/.claude/skills/"
        Set-Content (Join-Path $repoDir ".git\info\sparse-checkout") $sparseContent -Encoding utf8
        & git checkout HEAD 2>&1 | ForEach-Object { Write-Log $_ }

        # Add upstream remote for future updates
        & git remote rename origin upstream 2>&1 | ForEach-Object { Write-Log $_ }

        $script:StepsCompleted += "repo"
        Write-Log "Upstream cloned successfully" "OK"
        return $true
    } catch {
        Write-Log "Failed to clone upstream: $_" "ERROR"
        return $false
    }
}

function Step-InstallAdapter {
    $adapterDest = Join-Path $InstallDir "adapter"
    $adapterSource = Join-Path $PSScriptRoot "adapter"

    if (-not (Test-Path $adapterSource)) {
        Write-Log "Adapter source not found at $adapterSource" "ERROR"
        return $false
    }

    Write-Log "Installing adapter layer..." "STEP"
    try {
        if (Test-Path $adapterDest) {
            Remove-Item -Recurse -Force $adapterDest
        }
        Copy-Item -Path $adapterSource -Destination $adapterDest -Recurse

        $script:StepsCompleted += "adapter"
        Write-Log "Adapter installed at $adapterDest" "OK"
        return $true
    } catch {
        Write-Log "Failed to install adapter: $_" "ERROR"
        return $false
    }
}

function Step-ConfigureEnvironment {
    $adapterDir = Join-Path $InstallDir "adapter"
    $winCompat = Join-Path $adapterDir "win_compat.py"

    Write-Log "Configuring environment variables..." "STEP"
    try {
        # PYTHONSTARTUP - loads win_compat.py before any Python code
        [Environment]::SetEnvironmentVariable("PYTHONSTARTUP", $winCompat, "User")
        $env:PYTHONSTARTUP = $winCompat
        $script:StepsCompleted += "env"

        Write-Log "PYTHONSTARTUP set to $winCompat" "OK"
        return $true
    } catch {
        Write-Log "Failed to set environment variables: $_" "ERROR"
        return $false
    }
}

function Step-Onboarding {
    param([string]$User, [string]$Key)

    $repoDir = Join-Path $InstallDir "repo"

    # Collect user input if not provided
    if (-not $User) {
        Write-Host ""
        Write-Host "=== Mirror Mind Setup ===" -ForegroundColor Cyan
        Write-Host ""
        $User = Read-Host "Enter your Mirror Mind username (e.g. your first name)"
    }
    if (-not $User) {
        Write-Log "Username is required" "ERROR"
        return $false
    }

    if (-not $Key) {
        Write-Host ""
        Write-Host "You need an OpenRouter API key for Mirror Mind." -ForegroundColor Yellow
        Write-Host "Get one at: https://openrouter.ai/keys" -ForegroundColor Yellow
        Write-Host ""
        $Key = Read-Host "Enter your OPENROUTER_API_KEY"
    }

    # Create .env file
    Write-Log "Creating .env configuration..." "STEP"
    try {
        $envContent = @"
MIRROR_USER=$User
OPENROUTER_API_KEY=$Key
PYTHONSTARTUP=$(Join-Path $InstallDir "adapter" "win_compat.py")
"@
        $envFile = Join-Path $repoDir ".env"
        Set-Content -Path $envFile -Value $envContent -Encoding utf8
        $script:StepsCompleted += "envfile"
        Write-Log ".env created" "OK"
    } catch {
        Write-Log "Failed to create .env: $_" "ERROR"
        return $false
    }

    # Set user-level env vars for non-Pi runtimes
    [Environment]::SetEnvironmentVariable("MIRROR_USER", $User, "User")
    $env:MIRROR_USER = $User
    [Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", $Key, "User")
    $env:OPENROUTER_API_KEY = $Key

    # Install Python dependencies and initialize
    Write-Log "Installing Python dependencies (uv sync)..." "STEP"
    try {
        Set-Location $repoDir
        & uv sync 2>&1 | ForEach-Object { Write-Log $_ }
        if ($LASTEXITCODE -ne 0) {
            Write-Log "uv sync failed" "ERROR"
            return $false
        }
        Write-Log "Python dependencies installed" "OK"
    } catch {
        Write-Log "uv sync failed: $_" "ERROR"
        return $false
    }

    # Initialize user
    Write-Log "Initializing Mirror Mind for user '$User'..." "STEP"
    try {
        & uv run python -m memory init $User 2>&1 | ForEach-Object { Write-Log $_ }
        Write-Log "User initialized" "OK"
    } catch {
        Write-Log "User init failed: $_" "WARN"
    }

    # Seed identity
    Write-Log "Seeding identity data..." "STEP"
    try {
        & uv run python -m memory seed 2>&1 | ForEach-Object { Write-Log $_ }
        Write-Log "Identity seeded" "OK"
    } catch {
        Write-Log "Seed failed (non-critical): $_" "WARN"
    }

    return $true
}

function Step-ConfigurePi {
    $adapterDir = Join-Path $InstallDir "adapter"
    $winLogger = Join-Path $adapterDir "mirror-logger.win.ts"

    Write-Log "Configuring Pi to use Windows adapter extension..." "STEP"

    $piSettingsDir = Join-Path $env:USERPROFILE ".pi" "agent"
    if (-not (Test-Path $piSettingsDir)) {
        New-Item -ItemType Directory -Path $piSettingsDir -Force | Out-Null
    }

    $piSettingsFile = Join-Path $piSettingsDir "settings.json"

    try {
        $settings = @{}
        if (Test-Path $piSettingsFile) {
            $existing = Get-Content $piSettingsFile -Raw -Encoding utf8
            if ($existing.Trim()) {
                $settings = $existing | ConvertFrom-Json
            }
        }

        # Add extension override pointing to our Windows adapter
        $repoDir = Join-Path $InstallDir "repo"
        if (-not ($settings.PSObject.Properties.Name -contains "extensionOverrides" -or $settings -is [hashtable])) {
            $settings | Add-Member -NotePropertyName "extensionOverrides" -NotePropertyValue @{} -ErrorAction SilentlyContinue
        }

        # Write settings with the extension path
        $settingsContent = @"
{
  "extensionOverrides": {
    "mirror-logger": "$($winLogger -replace '\\', '\\\\')"
  }
}
"@
        Set-Content -Path $piSettingsFile -Value $settingsContent -Encoding utf8
        Write-Log "Pi configured to use $winLogger" "OK"
        return $true
    } catch {
        Write-Log "Failed to configure Pi settings: $_" "WARN"
        return $true
    }
}

function Step-CreateShortcut {
    $repoDir = Join-Path $InstallDir "repo"

    Write-Log "Creating Start Menu shortcut..." "STEP"
    try {
        $startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
        $shortcutPath = Join-Path $startMenuDir "Mirror Mind.lnk"

        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "powershell.exe"
        $shortcut.Arguments = "-NoExit -Command `"Set-Location '$repoDir'; Write-Host 'Mirror Mind - Ready' -ForegroundColor Cyan; Write-Host 'Type: pi  to start Pi agent' -ForegroundColor Yellow; Write-Host 'Type: uv run python -m memory list personas --verbose  to list personas' -ForegroundColor Yellow`""
        $shortcut.WorkingDirectory = $repoDir
        $shortcut.Description = "Mirror Mind - AI Memory Framework"
        $shortcut.Save()

        Write-Log "Shortcut created at $shortcutPath" "OK"
        return $true
    } catch {
        Write-Log "Failed to create shortcut: $_" "WARN"
        return $true
    }
}

# =============================================================================
# MAIN
# =============================================================================

$banner = @"

  __  __ _                       __  __ _           _
 |  \/  (_)_ __ _ __ ___  _ __ |  \/  (_)_ __   __| |
 | |\/| | | '__| '__/ _ \| '__|| |\/| | | '_ \ / _` |
 | |  | | | |  | | | (_) | |   | |  | | | | | | (_| |
 |_|  |_|_|_|  |_|  \___/|_|   |_|  |_|_|_| |_|\__,_|

  Windows Installer v1.2

"@
Write-Host $banner -ForegroundColor Cyan

Initialize-Log
Write-Log "Installation started" "STEP"
Write-Log "Install directory: $InstallDir"
Write-Log "Log file: $script:LogFile"

try {
    # --- Step 1: Dependencies ---
    if (-not $SkipDeps) {
        Write-Host ""
        Write-Log "=== Step 1/7: Dependencies ===" "STEP"

        $gitOk = Install-Dependency -Name "Git" -WingetId "Git.Git" -TestCommand "git"
        if (-not $gitOk) { throw "Git installation failed" }

        $nodeOk = Install-Dependency -Name "Node.js" -WingetId "OpenJS.NodeJS.LTS" -TestCommand "node"
        if (-not $nodeOk) { throw "Node.js installation failed" }

        $uvOk = Install-Uv
        if (-not $uvOk) { throw "uv installation failed" }

        $piOk = Install-Pi
        if (-not $piOk) { Write-Log "Pi installation failed (non-blocking)" "WARN" }
    } else {
        Write-Log "Skipping dependency installation (--SkipDeps)" "WARN"
    }

    # --- Step 2: Clone upstream ---
    Write-Host ""
    Write-Log "=== Step 2/7: Clone upstream ===" "STEP"
    $cloneOk = Step-CloneUpstream
    if (-not $cloneOk) { throw "Clone failed" }

    # --- Step 3: Install adapter ---
    Write-Host ""
    Write-Log "=== Step 3/7: Adapter layer ===" "STEP"
    $adapterOk = Step-InstallAdapter
    if (-not $adapterOk) { throw "Adapter installation failed" }

    # --- Step 4: Configure environment ---
    Write-Host ""
    Write-Log "=== Step 4/7: Environment ===" "STEP"
    $envOk = Step-ConfigureEnvironment
    if (-not $envOk) { throw "Environment configuration failed" }

    # --- Step 5: Onboarding ---
    Write-Host ""
    Write-Log "=== Step 5/7: Onboarding ===" "STEP"
    if ($Unattended -and (-not $UserName -or -not $ApiKey)) {
        Write-Log "Unattended mode requires -UserName and -ApiKey" "ERROR"
        throw "Missing parameters for unattended install"
    }
    $onboardOk = Step-Onboarding -User $UserName -Key $ApiKey
    if (-not $onboardOk) { throw "Onboarding failed" }

    # --- Step 6: Configure Pi ---
    Write-Host ""
    Write-Log "=== Step 6/7: Pi configuration ===" "STEP"
    Step-ConfigurePi | Out-Null

    # --- Step 7: Shortcut ---
    Write-Host ""
    Write-Log "=== Step 7/7: Shortcut ===" "STEP"
    Step-CreateShortcut | Out-Null

    # --- Cleanup ---
    $tempDir = Join-Path $env:TEMP "MirrorMindInstall"
    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    }

    # --- Done ---
    Write-Host ""
    Write-Host ("=" * 50) -ForegroundColor Green
    Write-Log "Installation complete!" "OK"
    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor Cyan
    Write-Host "    1. Open 'Mirror Mind' from the Start Menu" -ForegroundColor White
    Write-Host "    2. Type 'pi' to start the Pi agent" -ForegroundColor White
    Write-Host "    3. Type '/mm-mirror' to enter Mirror Mode" -ForegroundColor White
    Write-Host ""
    Write-Host "  Or test now:" -ForegroundColor Cyan
    $repoDir = Join-Path $InstallDir "repo"
    Write-Host "    cd $repoDir" -ForegroundColor White
    Write-Host "    uv run python -m memory list personas --verbose" -ForegroundColor White
    Write-Host ""
    Write-Host "  Log: $script:LogFile" -ForegroundColor Gray
    Write-Host ("=" * 50) -ForegroundColor Green

} catch {
    Write-Log "Installation failed: $_" "ERROR"
    Invoke-Rollback
    exit 1
}
