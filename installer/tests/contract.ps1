<#
.SYNOPSIS
    Assert installer/CONTRACT.md against a mirror-mind version, on the host,
    in a throwaway prefix and home. No Sandbox, no admin, ~1-2 minutes.

.DESCRIPTION
    Installs mirror-mind (and Pi) into a temporary npm prefix, points
    USERPROFILE/HOME/APPDATA at a temporary home, then runs exactly the
    commands install.ps1 runs, in the same order, and checks what the
    installer reads from each. -ThenUpdateToLatest runs `mirror runtime
    update` afterwards and checks again: that is the path a user takes
    after the install, and the one a core release can break.

    Uses the host's node/npm (the installer ships its own; the contract is
    about mirror-mind, not Node). Exit 0 when every check passes.

.EXAMPLE
    installer\tests\contract.ps1                          # pinned version (installer\MIRROR_VERSION)
    installer\tests\contract.ps1 -MirrorVersion latest    # canary
    installer\tests\contract.ps1 -ThenUpdateToLatest      # pinned, then the updater
#>
[CmdletBinding()]
param(
    [string]$MirrorVersion = "",
    [switch]$ThenUpdateToLatest,
    [switch]$SkipPi,
    [switch]$Keep
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $MirrorVersion) { $MirrorVersion = (Get-Content (Join-Path $here "..\MIRROR_VERSION") -Raw).Trim() }

$T = Join-Path ([IO.Path]::GetTempPath()) ("mirror-contract-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
$Prefix = Join-Path $T "node"; $Home_ = Join-Path $T "home"
New-Item -ItemType Directory -Force $Prefix, $Home_, "$Home_\AppData\Roaming", "$Home_\AppData\Local" | Out-Null

# Children see a home that is not yours. Nothing here reads the real one.
$env:USERPROFILE = $Home_; $env:HOME = $Home_
$env:APPDATA = "$Home_\AppData\Roaming"; $env:LOCALAPPDATA = "$Home_\AppData\Local"
$env:Path = "$Prefix;" + $env:Path
# The prefix as npm config, not as a flag: `npm root -g` must answer with it, which is
# what the core's install-kind check (and so `runtime update`) reads. The installer's
# prefix is the zip-installed Node's own folder, which npm treats the same way.
$env:npm_config_prefix = $Prefix
$env:MIRROR_USER = $null; $env:MIRROR_HOME = $null
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$fails = [System.Collections.Generic.List[string]]::new(); $passes = 0
function Check([string]$what, [bool]$ok, [string]$detail = "") {
    if ($ok) { $script:passes++; Write-Host ("  ok   {0}" -f $what) }
    else { $script:fails.Add($what); Write-Host ("  FAIL {0}  {1}" -f $what, $detail) -ForegroundColor Red }
}
function Run([string]$file, [string[]]$arguments) {
    $saved = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try { $out = & $file @arguments 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $saved }
    return @{ code = $LASTEXITCODE; out = ($out -join "`n") }
}
function Contract([string]$label) {
    Write-Host "== $label"
    $key = "helena"
    # the installer's order: env file, init, seed, pi install, status, welcome
    $cfg = "$Home_\.config\mirror"; New-Item -ItemType Directory -Force $cfg | Out-Null
    [IO.File]::WriteAllLines("$cfg\env", [string[]]@("MIRROR_USER=$key"), (New-Object Text.UTF8Encoding $false))

    $r = Run "mirror" @("runtime", "version")
    Check "runtime version exits 0" ($r.code -eq 0) $r.out
    Check "runtime version prints 'Version: <semver>'" ($r.out -match "(?m)^Version: \d+\.\d+\.\d+") $r.out
    $script:installedVersion = [regex]::Match($r.out, "(?m)^Version: (\S+)").Groups[1].Value
    Write-Host "       installed: $script:installedVersion"

    if (-not (Test-Path "$Home_\.mirror-minds\$key")) {
        $r = Run "mirror" @("init", $key)
        Check "init <key> exits 0" ($r.code -eq 0) $r.out
        Check "init creates ~/.mirror-minds/<key>" (Test-Path "$Home_\.mirror-minds\$key") ""
        $r = Run "mirror" @("init", "João Silva")
        Check "init refuses a non-key with exit 2 and creates nothing" (($r.code -eq 2) -and -not (Test-Path "$Home_\.mirror-minds\João Silva")) $r.out
        $r = Run "mirror" @("seed")
        Check "seed exits 0" ($r.code -eq 0) $r.out
        Check "seed reports 'Result: N created'" ($r.out -match "Result: \d+ created") $r.out
    }
    if (-not $SkipPi) {
        $pkg = Join-Path $Prefix "node_modules\mirror-mind"
        Check "package dir exists at <prefix>\node_modules\mirror-mind" (Test-Path $pkg) ""
        Check "package carries .pi\skills\mm-mirror\SKILL.md" (Test-Path "$pkg\.pi\skills\mm-mirror\SKILL.md") ""
        Check "package carries .pi\extensions\*.ts" (@(Get-ChildItem "$pkg\.pi\extensions\*.ts" -ErrorAction SilentlyContinue).Count -gt 0) ""
        $r = Run "pi" @("install", $pkg)
        Check "pi install <pkg> exits 0" ($r.code -eq 0) $r.out
    }
    $r = Run "mirror" @("runtime", "status")
    Check "runtime status exits 0" ($r.code -eq 0) $r.out
    foreach ($line in "Version:", "Install:", "Database exists: yes", "Core migrations:") {
        Check "runtime status has '$line'" ($r.out -match ("(?m)^" + [regex]::Escape($line))) ""
    }
    $r = Run "mirror" @("welcome")
    Check "welcome exits 0" ($r.code -eq 0) $r.out
    Check "config env still names the user" (@(Get-Content "$cfg\env") -contains "MIRROR_USER=$key") ""
}

try {
    Write-Host "== npm install -g mirror-mind@$MirrorVersion (prefix $Prefix)"
    $r = Run "npm" @("install", "-g", "--no-audit", "--no-fund", "--loglevel", "error", "mirror-mind@$MirrorVersion")
    Check "npm install mirror-mind@$MirrorVersion" ($r.code -eq 0) $r.out
    Check "npm prefix has mirror.cmd" (Test-Path "$Prefix\mirror.cmd") ""
    if (-not $SkipPi) {
        $r = Run "npm" @("install", "-g", "--no-audit", "--no-fund", "--loglevel", "error", "@earendil-works/pi-coding-agent")
        Check "npm install pi" ($r.code -eq 0) $r.out
    }
    Contract "contract against mirror-mind@$MirrorVersion"

    if ($ThenUpdateToLatest) {
        $r = Run "mirror" @("runtime", "update")
        Check "runtime update exits 0" ($r.code -eq 0) $r.out
        Contract "contract after runtime update"
    }
} finally {
    if ($Keep) { Write-Host "kept: $T" } else { Remove-Item $T -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host ""
Write-Host ("{0} passed, {1} failed" -f $passes, $fails.Count)
if ($fails.Count) { $fails | ForEach-Object { Write-Host "  - $_" }; exit 1 }
exit 0
