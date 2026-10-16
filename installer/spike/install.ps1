<#
.SYNOPSIS
    Mirror Mind for Windows -- installer spike (v2, over the npm package).

.DESCRIPTION
    The smallest verifiable result before any wizard: from a clean Windows,
    put Node 24, Pi and mirror-mind on the machine per-user (no elevation),
    initialize an identity, wire Pi, configure OpenRouter for BOTH the chat
    model (Pi) and Mirror's memory, and end with `mirror welcome` rendered.

    Everything is logged to -OutDir so the run can be read back afterwards.
    Windows PowerShell 5.1 compatible (what Windows Sandbox ships).

.PARAMETER User
    MIRROR_USER. The identity's name on this machine.
.PARAMETER OpenRouterKey
    Optional. When absent, read from <OutDir>\openrouter.key, else prompted.
.PARAMETER MirrorVersion
    npm dist-tag or version for mirror-mind. Default: latest.
.PARAMETER Launch
    Open Pi at the end.
#>
[CmdletBinding()]
param(
    [string]$User = "Mirror",
    [string]$OpenRouterKey = "",
    [string]$MirrorVersion = "latest",
    [string]$NodeMajor = "24",
    [string]$OutDir = "C:\Out",
    [switch]$Launch
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Base   = Join-Path $env:LOCALAPPDATA "Programs\MirrorMind"
$NodeDir = Join-Path $Base "node"
$NpmPrefix = Join-Path $env:APPDATA "npm"
$Workspace = Join-Path $env:USERPROFILE "Mirror"
$ConfigDir = Join-Path $env:USERPROFILE ".config\mirror"
$PiDir = Join-Path $env:USERPROFILE ".pi\agent"
New-Item -ItemType Directory -Force -Path $OutDir, $Base, $Workspace | Out-Null
$Log = Join-Path $OutDir ("install-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$Report = [ordered]@{ started = (Get-Date).ToString("o"); steps = [ordered]@{} }

function Say([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
    Write-Host $line
    Add-Content -Path $Log -Value $line
}
function Step([string]$name, [scriptblock]$action) {
    Say "== $name"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $value = & $action
        $Report.steps[$name] = @{ ok = $true; ms = $sw.ElapsedMilliseconds; value = "$value" }
        Say "   ok ($($sw.ElapsedMilliseconds) ms) $value"
    } catch {
        $Report.steps[$name] = @{ ok = $false; ms = $sw.ElapsedMilliseconds; error = "$_" }
        Say "   FAILED: $_"
        throw
    }
}
function Run([string]$file, [string[]]$args) {
    # Capture both streams into the log; return stdout.
    $out = & $file @args 2>&1
    $out | ForEach-Object { Add-Content -Path $Log -Value ("     | " + $_) }
    if ($LASTEXITCODE -ne 0) { throw "$file $($args -join ' ') exited $LASTEXITCODE`n$($out -join "`n")" }
    return ($out | Out-String).Trim()
}
function AddUserPath([string]$dir) {
    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (($current -split ";") -contains $dir)) {
        [Environment]::SetEnvironmentVariable("Path", ($dir + ";" + $current).TrimEnd(";"), "User")
    }
    if (-not (($env:Path -split ";") -contains $dir)) { $env:Path = $dir + ";" + $env:Path }
}

try {
    Step "preflight" {
        $os = Get-CimInstance Win32_OperatingSystem
        $arch = $env:PROCESSOR_ARCHITECTURE
        if ($arch -ne "AMD64") { throw "only x64 is covered by this spike (got $arch)" }
        $null = Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/index.json" -Method Head -TimeoutSec 20
        $have = @{}
        foreach ($c in "node", "npm", "pi", "mirror", "git", "winget") {
            $cmd = Get-Command $c -ErrorAction SilentlyContinue
            $have[$c] = if ($cmd) { $cmd.Source } else { $null }
        }
        $Report.preflight = @{ os = $os.Caption; build = $os.BuildNumber; arch = $arch; have = $have; psVersion = "$($PSVersionTable.PSVersion)" }
        "$($os.Caption) build $($os.BuildNumber) | pre-existing: " + (($have.GetEnumerator() | Where-Object Value | ForEach-Object Key) -join ", ")
    }

    Step "node $NodeMajor (per-user zip, pinned by SHASUMS256)" {
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
        $zipPath = Join-Path $env:TEMP $zipName
        Say "   downloading $zipName"
        Invoke-WebRequest -UseBasicParsing -Uri ($dist + $zipName) -OutFile $zipPath -TimeoutSec 600
        $actual = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
        if ($actual -ne $sha.ToLower()) { throw "SHA-256 mismatch for $zipName" }
        if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
        $extract = Join-Path $env:TEMP "node-extract"
        if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
        Expand-Archive -Path $zipPath -DestinationPath $extract
        Move-Item (Get-ChildItem $extract | Select-Object -First 1).FullName $NodeDir
        Remove-Item $zipPath, $extract -Recurse -Force -ErrorAction SilentlyContinue
        AddUserPath $NodeDir
        "installed " + (& node -v) + " at $NodeDir (sha256 verified)"
    }

    Step "npm global prefix on PATH" {
        $prefix = (& npm prefix -g).Trim()
        AddUserPath $prefix
        "npm " + (& npm -v) + " | prefix $prefix"
    }

    Step "pi" {
        if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
            Run "npm" @("install", "-g", "@earendil-works/pi-coding-agent", "--no-fund", "--no-audit") | Out-Null
        }
        "pi " + (& pi --version 2>&1 | Select-Object -First 1)
    }

    Step "mirror-mind@$MirrorVersion" {
        Run "npm" @("install", "-g", "mirror-mind@$MirrorVersion", "--no-fund", "--no-audit") | Out-Null
        "mirror " + (& mirror runtime version 2>&1 | Select-String "^Version:" | Select-Object -First 1)
    }

    Step "mirror init $User + seed" {
        $initOut = Run "mirror" @("init", $User)
        $seedOut = Run "mirror" @("seed")
        "init: " + ($initOut -split "`n" | Select-Object -First 1) + " | seed: " + ($seedOut -split "`n" | Select-Object -Last 1)
    }

    Step "pi install <mirror-mind package>" {
        $pkg = Join-Path (& npm prefix -g).Trim() "node_modules\mirror-mind"
        Run "pi" @("install", $pkg)
    }

    Step "openrouter key -> Mirror memory + Pi chat" {
        $key = $OpenRouterKey
        $keyFile = Join-Path $OutDir "openrouter.key"
        if (-not $key -and (Test-Path $keyFile)) { $key = (Get-Content $keyFile -Raw).Trim() }
        if (-not $key) { $key = (Read-Host "OpenRouter API key (sk-or-v1-...)").Trim() }
        if (-not $key.StartsWith("sk-or-")) { throw "that does not look like an OpenRouter key" }
        # Validate once against the API, as the v1 installer did.
        $me = Invoke-RestMethod -Uri "https://openrouter.ai/api/v1/auth/key" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 30
        # Mirror: ~/.config/mirror/env (init created it with MIRROR_USER)
        $envFile = Join-Path $ConfigDir "env"
        if (-not (Test-Path $envFile)) { New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null; "MIRROR_USER=$User" | Set-Content $envFile }
        $lines = Get-Content $envFile | Where-Object { $_ -notmatch "^OPENROUTER_API_KEY=" }
        $lines + "OPENROUTER_API_KEY=$key" | Set-Content $envFile
        # Pi: the same key as a user environment variable, OpenRouter as the startup provider
        [Environment]::SetEnvironmentVariable("OPENROUTER_API_KEY", $key, "User"); $env:OPENROUTER_API_KEY = $key
        New-Item -ItemType Directory -Force -Path $PiDir | Out-Null
        $settingsPath = Join-Path $PiDir "settings.json"
        $settings = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
        $settings | Add-Member -NotePropertyName defaultProvider -NotePropertyValue "openrouter" -Force
        $settings | ConvertTo-Json -Depth 5 | Set-Content $settingsPath
        "key valid (label: $($me.data.label); usage $($me.data.usage)); written to $envFile and Pi settings"
    }

    Step "launcher + shortcut" {
        $launcher = Join-Path $Base "mirror.cmd"
        @(
            "@echo off",
            "chcp 65001 >nul 2>&1",
            "set ""EDITOR=notepad""",
            "set ""Path=$NodeDir;$NpmPrefix;%Path%""",
            "cd /d ""$Workspace""",
            "title Mirror Mind",
            "pi %*"
        ) | Set-Content $launcher -Encoding ASCII
        $sh = New-Object -ComObject WScript.Shell
        $lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Mirror Mind.lnk"))
        $lnk.TargetPath = "$env:windir\System32\cmd.exe"
        $lnk.Arguments = "/k """ + $launcher + """"
        $lnk.WorkingDirectory = $Workspace
        $lnk.Save()
        "$launcher + Desktop shortcut"
    }

    Step "verify" {
        $status = Run "mirror" @("runtime", "status")
        $welcome = Run "mirror" @("welcome")
        $Report.verify = @{ status = $status; welcome = $welcome }
        ($status -split "`n" | Where-Object { $_ -match "^(Version|Install|Mirror home|Database exists|Core migrations|Status):" }) -join " | "
    }

    $Report.ok = $true
} catch {
    $Report.ok = $false
    $Report.error = "$_"
} finally {
    $Report.finished = (Get-Date).ToString("o")
    $Report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "report.json")
    Say ("== result: " + $(if ($Report.ok) { "OK" } else { "FAILED -- " + $Report.error }))
    Say "   log: $Log | report: $(Join-Path $OutDir 'report.json')"
}

if ($Report.ok -and $Launch) {
    Set-Location $Workspace
    & pi
}
