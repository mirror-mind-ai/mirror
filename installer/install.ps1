<#
.SYNOPSIS
    Mirror Mind for Windows -- installer phases (v2, over the npm package).

.DESCRIPTION
    Called by the Inno Setup wizard (mirror.iss) in two phases, and runnable by
    hand for repair. Everything is per-user under -InstallDir (no elevation).

      bootstrap  Node 24 (zip, pinned by SHASUMS256), Git for Windows portable
                 (Pi's bash), Pi, mirror-mind. Runs on the "Installing" page,
                 before the person is asked anything.
      configure  The identity: ~/.config/mirror/env, `mirror init`, `mirror
                 seed`, `pi install`, the OpenRouter key validated once and
                 handed to BOTH Mirror's memory and Pi's chat, the launcher.
                 Runs after the "Set up your Mirror" page.

    The spike this grew from (installer/spike/install.ps1) ran the same steps
    end to end in Windows Sandbox on 2026-10-16. Windows PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet("bootstrap", "configure")][string]$Phase,
    [Parameter(Mandatory)][string]$InstallDir,
    [string]$MirrorUser = "",
    [string]$OpenRouterApiKey = "",
    [string]$MirrorVersion = "latest",
    [string]$NodeMajor = "24",
    # Decided 2026-10-16: one OpenRouter key powers Pi's chat and Mirror's memory;
    # the chat default is Sonnet through the alias that follows upgrades.
    [string]$ChatModel = "~anthropic/claude-sonnet-latest",
    # The wizard streams this file into its page and waits for the MIRRORDONE line.
    # ANSI on purpose: Inno reads it as an AnsiString.
    [string]$TranscriptLog = "",
    # Everything, including native command output. Default: <InstallDir>\logs\install-detail.log.
    [string]$DetailLog = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # PS 5.1 renders progress per chunk; downloads crawl
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$RunId = [guid]::NewGuid().ToString("N").Substring(0, 8)

$NodeDir = Join-Path $InstallDir "node"
$GitDir = Join-Path $InstallDir "git"
$GitBash = Join-Path $GitDir "bin\bash.exe"
$BinDir = Join-Path $InstallDir "bin"
$Workspace = Join-Path $env:USERPROFILE "Mirror"
$ConfigDir = Join-Path $env:USERPROFILE ".config\mirror"
$PiDir = Join-Path $env:USERPROFILE ".pi\agent"

# Git for Windows, portable: Pi's bash tool needs a bash.exe on Windows and looks
# for Git Bash or for `shellPath` in its settings; without one every mm-* skill
# fails. Pinned; the hash is the one the release page publishes.
$GitVersion = "2.56.0.2"
$GitTag = "v2.56.0.windows.2"
$GitSha256 = "075e158ef8e1f0ab80b347e245405d3eca735c2dc88fd8e032e137d0ca61f61b"

if (-not $DetailLog) { $DetailLog = Join-Path $InstallDir "logs\install-detail.log" }
New-Item -ItemType Directory -Force -Path (Split-Path $DetailLog), $InstallDir, $BinDir | Out-Null

function Say([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
    Write-Host $line
    Add-Content -Path $DetailLog -Value $line
    if ($TranscriptLog) { Add-Content -Path $TranscriptLog -Value $line -Encoding Default }
}
function Done([int]$code) {
    if ($TranscriptLog) { Add-Content -Path $TranscriptLog -Value "MIRRORDONE:$code" -Encoding Default }
    exit $code
}
function Step([string]$name, [scriptblock]$action) {
    Say "== $name"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $value = & $action
        Say "   ok ($($sw.ElapsedMilliseconds) ms) $value"
    } catch {
        Say "   FAILED: $_"
        throw
    }
}
function Run([string]$file, [string[]]$arguments) {
    # Judge native commands by exit code only: under Stop, PowerShell 5.1 turns a
    # native command's first stderr line into an exception (`npm warn` would abort
    # a healthy install).
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $out = & $file @arguments 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $saved }
    $out | ForEach-Object { Add-Content -Path $DetailLog -Value ("     | " + $_) }
    if ($LASTEXITCODE -ne 0) { throw "$file $($arguments -join ' ') exited $LASTEXITCODE`n$($out -join "`n")" }
    return ($out | Out-String).Trim()
}
function RunSoft([string]$file, [string[]]$arguments) {
    try { return Run $file $arguments } catch { return "$_" }
}
function AddUserPath([string]$dir) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (($current -split ";") -contains $dir)) {
        [Environment]::SetEnvironmentVariable("Path", ($dir + ";" + $current).TrimEnd(";"), "User")
    }
    if (-not (($env:Path -split ";") -contains $dir)) { $env:Path = $dir + ";" + $env:Path }
}
function UseInstalledTools() {
    # A new process does not see the user PATH written a moment ago.
    foreach ($d in @($NodeDir, (Join-Path $GitDir "cmd"))) {
        if ((Test-Path $d) -and -not (($env:Path -split ";") -contains $d)) { $env:Path = $d + ";" + $env:Path }
    }
}
function Download([string]$url, [string]$target, [string]$sha256) {
    (New-Object Net.WebClient).DownloadFile($url, $target)
    $actual = (Get-FileHash $target -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $sha256.ToLower()) { throw "SHA-256 mismatch for $(Split-Path -Leaf $target)" }
}
function WriteMirrorEnv([string]$user, [string]$key) {
    # ~/.config/mirror/env, rebuilt deterministically: MIRROR_USER first, the key
    # when known, any other line kept. (init writes the file without a final
    # newline, and Get-Content hands one line back as a string that `+` would
    # concatenate rather than append.)
    New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
    $envFile = Join-Path $ConfigDir "env"
    $others = @()
    if (Test-Path $envFile) {
        foreach ($line in @(Get-Content $envFile)) {
            if (-not $key -and $line -match "^OPENROUTER_API_KEY=(sk-or-\S+)$") { $key = $Matches[1]; continue }
            if ($line -and $line -notmatch "MIRROR_USER=" -and $line -notmatch "OPENROUTER_API_KEY=") { $others += $line }
        }
    }
    $lines = @("MIRROR_USER=$user")
    if ($key) { $lines += "OPENROUTER_API_KEY=$key" }
    ($lines + $others) | Set-Content $envFile -Encoding ASCII
    return $envFile
}

function Invoke-Bootstrap {
    Step "preflight" {
        if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") { throw "only x64 Windows is supported (got $env:PROCESSOR_ARCHITECTURE)" }
        $null = Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/index.json" -Method Head -TimeoutSec 20
        $os = Get-CimInstance Win32_OperatingSystem
        "$($os.Caption) build $($os.BuildNumber)"
    }

    Step "Node.js $NodeMajor" {
        UseInstalledTools
        $existing = Get-Command node -ErrorAction SilentlyContinue
        if ($existing) {
            $v = (& node -v) -replace "^v", ""
            if ([int]($v.Split(".")[0]) -ge [int]$NodeMajor) { return "already present: node $v at $($existing.Source)" }
        }
        $dist = "https://nodejs.org/dist/latest-v$NodeMajor.x/"
        $shas = (Invoke-WebRequest -UseBasicParsing -Uri ($dist + "SHASUMS256.txt") -TimeoutSec 60).Content
        $line = ($shas -split "`n" | Where-Object { $_ -match "node-v[\d.]+-win-x64\.zip" } | Select-Object -First 1)
        if (-not $line) { throw "no win-x64 zip in $dist" }
        $sha, $zipName = ($line.Trim() -split "\s+")
        $zipPath = Join-Path $env:TEMP "mirror-$RunId-$zipName"
        Say "   downloading $zipName"
        Download ($dist + $zipName) $zipPath $sha
        if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
        $extract = Join-Path $env:TEMP "mirror-$RunId-node"
        Expand-Archive -Path $zipPath -DestinationPath $extract
        Move-Item (Get-ChildItem $extract | Select-Object -First 1).FullName $NodeDir
        Remove-Item $zipPath, $extract -Recurse -Force -ErrorAction SilentlyContinue
        AddUserPath $NodeDir
        "installed " + (& node -v) + " (sha256 verified)"
    }

    Step "npm global prefix on PATH" {
        $prefix = (& npm prefix -g).Trim()
        AddUserPath $prefix
        "npm " + (& npm -v) + " | prefix $prefix"
    }

    Step "Git for Windows $GitVersion (portable, Pi's bash)" {
        if (Test-Path $GitBash) { return "already present: $GitBash" }
        $name = "PortableGit-$GitVersion-64-bit.7z.exe"
        $sfx = Join-Path $env:TEMP "mirror-$RunId-$name"
        Say "   downloading $name (60 MB)"
        Download "https://github.com/git-for-windows/git/releases/download/$GitTag/$name" $sfx $GitSha256
        $proc = Start-Process -FilePath $sfx -ArgumentList @(('-o"{0}"' -f $GitDir), "-y") -Wait -PassThru -WindowStyle Hidden
        if ($proc.ExitCode -ne 0) { throw "PortableGit extraction exited $($proc.ExitCode)" }
        Remove-Item $sfx -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path $GitBash)) { throw "bash.exe not found after extraction" }
        "installed $(& $GitBash --version) (sha256 verified)"
    }

    Step "Pi" {
        if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
            Run "npm" @("install", "-g", "@earendil-works/pi-coding-agent", "--no-fund", "--no-audit") | Out-Null
        }
        "pi " + ((Run "pi" @("--version")) -split "`n" | Select-Object -First 1)
    }

    Step "mirror-mind@$MirrorVersion" {
        Run "npm" @("install", "-g", "mirror-mind@$MirrorVersion", "--no-fund", "--no-audit") | Out-Null
        ((Run "mirror" @("runtime", "version")) -split "`n" | Where-Object { $_ -match "^Version:" } | Select-Object -First 1)
    }
}

function Invoke-Configure {
    if (-not $MirrorUser) { throw "configure needs -MirrorUser" }
    if (-not $OpenRouterApiKey) { throw "configure needs -OpenRouterApiKey" }
    UseInstalledTools

    Step "OpenRouter key" {
        if (-not $OpenRouterApiKey.StartsWith("sk-or-")) { throw "that does not look like an OpenRouter key (sk-or-...)" }
        $me = Invoke-RestMethod -Uri "https://openrouter.ai/api/v1/auth/key" -Headers @{ Authorization = "Bearer $OpenRouterApiKey" } -TimeoutSec 30
        "valid (label $($me.data.label))"
    }

    Step "Mirror configuration (~/.config/mirror/env)" {
        WriteMirrorEnv $MirrorUser $OpenRouterApiKey
    }

    Step "mirror init $MirrorUser + seed" {
        # init refuses an identity that already exists (it never overwrites a profile);
        # a re-run or a repair skips it. seed is idempotent: it only adds what is missing.
        $identity = Join-Path $env:USERPROFILE ".mirror-minds\$MirrorUser\identity"
        if (Test-Path $identity) {
            $initLine = "identity already present"
        } else {
            $initLine = (Run "mirror" @("init", $MirrorUser)) -split "`n" | Select-Object -First 1
        }
        $seedOut = Run "mirror" @("seed")
        "$initLine | " + ($seedOut -split "`n" | Select-Object -Last 1)
    }

    Step "pi install (Mirror's skills and extension)" {
        $pkg = Join-Path (& npm prefix -g).Trim() "node_modules\mirror-mind"
        (Run "pi" @("install", $pkg)) -split "`n" | Select-Object -Last 1
    }

    Step "Pi: OpenRouter as the chat provider, Git Bash as the shell" {
        [Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", $OpenRouterApiKey, "User")
        New-Item -ItemType Directory -Force -Path $PiDir | Out-Null
        $settingsPath = Join-Path $PiDir "settings.json"
        $settings = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
        $settings | Add-Member -NotePropertyName defaultProvider -NotePropertyValue "openrouter" -Force
        $settings | Add-Member -NotePropertyName defaultModel -NotePropertyValue $ChatModel -Force
        $settings | Add-Member -NotePropertyName shellPath -NotePropertyValue $GitBash -Force
        $settings | ConvertTo-Json -Depth 5 | Set-Content $settingsPath
        "model $ChatModel"
    }

    Step "workspace" {
        New-Item -ItemType Directory -Force -Path $Workspace | Out-Null
        $Workspace
    }

    Step "verify" {
        $status = RunSoft "mirror" @("runtime", "status")
        $null = Run "mirror" @("welcome")
        ($status -split "`n" | Where-Object { $_ -match "^(Version|Install|Database exists|Core migrations):" }) -join " | "
    }
}

try {
    Say "== phase: $Phase | install dir: $InstallDir"
    if ($Phase -eq "bootstrap") { Invoke-Bootstrap } else { Invoke-Configure }
    Say "== ${Phase}: OK"
    Done 0
} catch {
    Say "== ${Phase}: FAILED -- $_"
    Done 1
}
