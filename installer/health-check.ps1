<#
.SYNOPSIS
    Mirror Mind (Windows) post-install / post-update health check.

.DESCRIPTION
    Validates that a Windows install is functional. Useful after a
    'runtime update' to confirm nothing regressed. Unlike the legacy adapter
    health check, this targets an upstream-native install (no adapter layer):
    the Mirror app lives at <InstallDir>\app.

    Checks: Git, Node.js, uv, Pi on PATH; 'uv run python' works; the memory
    module imports; and 'memory runtime status' runs.

.PARAMETER InstallDir
    Base install directory. The repo is expected at <InstallDir>\app.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File health-check.ps1
#>
[CmdletBinding()]
param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\MirrorMind')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$script:Errors = 0
$script:Warnings = 0

function Write-Check {
    param([string]$Name, [ValidateSet('OK', 'WARN', 'FAIL')][string]$Status, [string]$Detail = '')
    $icon = @{ OK = '[ ok ]'; WARN = '[warn]'; FAIL = '[fail]' }[$Status]
    $color = @{ OK = 'Green'; WARN = 'Yellow'; FAIL = 'Red' }[$Status]
    Write-Host ("{0} {1}" -f $icon, $Name) -ForegroundColor $color
    if ($Detail) { Write-Host "       $Detail" -ForegroundColor Gray }
    if ($Status -eq 'FAIL') { $script:Errors++ }
    if ($Status -eq 'WARN') { $script:Warnings++ }
}

function Test-Tool {
    param([string]$Name, [string]$Command, [string[]]$VersionArgs = @('--version'))
    $cmd = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $cmd) { Write-Check $Name 'FAIL' "'$Command' not found on PATH"; return }
    try {
        $ver = (& $Command @VersionArgs 2>&1 | Out-String).Trim()
        Write-Check $Name 'OK' $ver
    } catch {
        Write-Check $Name 'WARN' "found but version probe failed: $($_.Exception.Message)"
    }
}

$repo = Join-Path $InstallDir 'app'

Write-Host ''
Write-Host 'Mirror Mind - Windows health check' -ForegroundColor Cyan
Write-Host ('=' * 44)
Write-Host "Install: $InstallDir"
Write-Host ''

# 1. Tools on PATH
Test-Tool -Name 'Git'  -Command 'git'
Test-Tool -Name 'Node' -Command 'node'
Test-Tool -Name 'uv'   -Command 'uv'
Test-Tool -Name 'Pi'   -Command 'pi'

# 2. Repo present
if (Test-Path -LiteralPath (Join-Path $repo 'pyproject.toml')) {
    Write-Check 'Mirror repo' 'OK' $repo
} else {
    Write-Check 'Mirror repo' 'FAIL' "pyproject.toml not found under $repo"
}

if (-not (Test-Path -LiteralPath (Join-Path $repo 'pyproject.toml'))) {
    Write-Check 'uv-based checks' 'FAIL' "repo missing at $repo; skipping Python checks"
} elseif (Get-Command 'uv' -ErrorAction SilentlyContinue) {
    Push-Location $repo
    try {
        # 3. uv run python works
        $py = (& uv run python --version 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -eq 0) { Write-Check 'uv run python' 'OK' $py }
        else { Write-Check 'uv run python' 'FAIL' $py }

        # 4. memory module imports
        $imp = (& uv run python -c "import memory; print(memory.__file__)" 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -eq 0) { Write-Check 'memory module import' 'OK' $imp }
        else { Write-Check 'memory module import' 'FAIL' $imp }

        # 5. runtime status runs
        $rs = (& uv run python -m memory runtime status 2>&1 | Out-String)
        if ($LASTEXITCODE -eq 0) { Write-Check 'memory runtime status' 'OK' }
        else { Write-Check 'memory runtime status' 'WARN' 'runtime status returned non-zero (see details in a terminal)' }
    } finally {
        Pop-Location -ErrorAction SilentlyContinue
    }
} else {
    Write-Check 'uv-based checks' 'FAIL' 'uv not available; skipping Python checks'
}

Write-Host ''
Write-Host ('=' * 44)
if ($script:Errors -gt 0) {
    Write-Host ("RESULT: {0} FAIL, {1} WARN" -f $script:Errors, $script:Warnings) -ForegroundColor Red
    exit 1
} elseif ($script:Warnings -gt 0) {
    Write-Host ("RESULT: OK with {0} warning(s)" -f $script:Warnings) -ForegroundColor Yellow
    exit 0
} else {
    Write-Host 'RESULT: ALL OK' -ForegroundColor Green
    exit 0
}
