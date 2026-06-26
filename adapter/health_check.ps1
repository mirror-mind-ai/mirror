<#
.SYNOPSIS
    Mirror Mind Windows Adapter - Health Check

.DESCRIPTION
    Validates that the adapter layer is compatible with the current upstream version.
    Run after each "uv run python -m memory runtime update" to detect breaking changes.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File health_check.ps1
#>

param(
    [string]$RepoDir = "$env:LOCALAPPDATA\MirrorMind\repo",
    [string]$AdapterDir = "$env:LOCALAPPDATA\MirrorMind\adapter"
)

$ErrorActionPreference = "Continue"
$script:Errors = 0
$script:Warnings = 0

function Write-Check {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    $icon = switch ($Status) {
        "OK"   { "[OK]  " }
        "WARN" { "[WARN]" }
        "FAIL" { "[FAIL]" }
    }
    $color = switch ($Status) {
        "OK"   { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    Write-Host "$icon $Name" -ForegroundColor $color
    if ($Detail) { Write-Host "       $Detail" -ForegroundColor Gray }
    if ($Status -eq "FAIL") { $script:Errors++ }
    if ($Status -eq "WARN") { $script:Warnings++ }
}

Write-Host ""
Write-Host "Mirror Mind Windows Adapter - Health Check" -ForegroundColor Cyan
Write-Host ("=" * 50)
Write-Host ""

# --- 1. Check Python is available via uv ---
try {
    $pyVersion = & uv run python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Check "Python via uv" "OK" "$pyVersion"
    } else {
        Write-Check "Python via uv" "FAIL" "uv run python failed: $pyVersion"
    }
} catch {
    Write-Check "Python via uv" "FAIL" "uv not found in PATH"
}

# --- 2. Check memory module is importable ---
try {
    $memCheck = & uv run python -c "import memory; print(f'memory module at {memory.__file__}')" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Check "memory module" "OK" "$memCheck"
    } else {
        Write-Check "memory module" "FAIL" "Cannot import memory module"
    }
} catch {
    Write-Check "memory module" "FAIL" "$_"
}

# --- 3. Check win_compat.py selftest ---
$winCompat = Join-Path $AdapterDir "win_compat.py"
if (Test-Path $winCompat) {
    try {
        $selftestOutput = & uv run python $winCompat --selftest 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Check "win_compat.py selftest" "OK"
        } else {
            Write-Check "win_compat.py selftest" "FAIL" ($selftestOutput | Out-String)
        }
    } catch {
        Write-Check "win_compat.py selftest" "FAIL" "$_"
    }
} else {
    Write-Check "win_compat.py" "FAIL" "File not found at $winCompat"
}

# --- 4. Check PYTHONSTARTUP is set correctly ---
$expectedStartup = $winCompat
$actualStartup = $env:PYTHONSTARTUP
if ($actualStartup -eq $expectedStartup) {
    Write-Check "PYTHONSTARTUP" "OK" "$actualStartup"
} elseif ($actualStartup -and (Test-Path $actualStartup)) {
    Write-Check "PYTHONSTARTUP" "WARN" "Set to '$actualStartup' (expected '$expectedStartup')"
} else {
    Write-Check "PYTHONSTARTUP" "FAIL" "Not set or file missing. Should be '$expectedStartup'"
}

# --- 5. Check upstream Python interfaces the adapter hooks ---

# 5a. subprocess module (win_compat patches Popen.__init__)
try {
    $subprocCheck = & uv run python -c "import subprocess; print(type(subprocess.Popen))" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Check "subprocess.Popen interface" "OK"
    } else {
        Write-Check "subprocess.Popen interface" "FAIL" "Interface changed"
    }
} catch {
    Write-Check "subprocess.Popen interface" "FAIL" "$_"
}

# 5b. config.py still has read_text (the call win_compat patches)
$configPy = Join-Path $RepoDir "src\memory\config.py"
if (Test-Path $configPy) {
    $configContent = Get-Content $configPy -Raw
    $hasBarReadText = $configContent -match 'read_text\('
    if ($configContent -match 'read_text\(' -and $configContent -notmatch 'read_text\(encoding') {
        Write-Check "config.py read_text call" "OK" "Encoding patch target present"
    } elseif ($hasBarReadText) {
        Write-Check "config.py read_text" "OK" "read_text called with explicit encoding"
    } else {
        Write-Check "config.py read_text" "WARN" "read_text call not found - may have been refactored"
    }
} else {
    Write-Check "config.py" "WARN" "File not found at $configPy (repo path may differ)"
}

# 5c. identity_cmd.py editor fallback
$identityPy = Join-Path $RepoDir "src\memory\cli\identity_cmd.py"
if (Test-Path $identityPy) {
    $idContent = Get-Content $identityPy -Raw
    if ($idContent -match '"nano"') {
        Write-Check "identity_cmd.py editor fallback" "OK" "nano fallback present (adapter overrides with notepad)"
    } elseif ($idContent -match 'EDITOR|VISUAL') {
        Write-Check "identity_cmd.py editor fallback" "OK" "Editor detection present"
    } else {
        Write-Check "identity_cmd.py editor fallback" "WARN" "Editor pattern not found - may have changed"
    }
} else {
    Write-Check "identity_cmd.py" "WARN" "File not found"
}

# --- 6. Check mirror-logger.ts upstream hasn't diverged critically ---
$loggerTs = Join-Path $RepoDir ".pi\extensions\mirror-logger.ts"
if (Test-Path $loggerTs) {
    $loggerContent = Get-Content $loggerTs -Raw
    $checkNames = @("spawn import", "pi.exec call", "session_start handler", "session_shutdown handler")
    $checkStrings = @("node:child_process", "pi.exec", "session_start", "session_shutdown")
    for ($i = 0; $i -lt $checkNames.Count; $i++) {
        if ($loggerContent.Contains($checkStrings[$i])) {
            Write-Check "mirror-logger.ts: $($checkNames[$i])" "OK"
        } else {
            Write-Check "mirror-logger.ts: $($checkNames[$i])" "WARN" "Pattern not found - upstream may have changed"
        }
    }
} else {
    Write-Check "mirror-logger.ts" "WARN" "File not found at $loggerTs"
}

# --- 7. Check Node.js is available ---
try {
    $nodeVersion = & node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Check "Node.js" "OK" "$nodeVersion"
    } else {
        Write-Check "Node.js" "FAIL" "node not found"
    }
} catch {
    Write-Check "Node.js" "FAIL" "node not found in PATH"
}

# --- 8. Check Git is available ---
try {
    $gitVersion = & git --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Check "Git" "OK" "$gitVersion"
    } else {
        Write-Check "Git" "FAIL" "git not found"
    }
} catch {
    Write-Check "Git" "FAIL" "git not found in PATH"
}

# --- Summary ---
Write-Host ""
Write-Host ("=" * 50)
if ($script:Errors -gt 0) {
    Write-Host "RESULT: $($script:Errors) FAIL, $($script:Warnings) WARN" -ForegroundColor Red
    Write-Host ""
    Write-Host "Some checks failed. The adapter may not work correctly." -ForegroundColor Red
    Write-Host "Check https://github.com/rodrigoimmaginario/mirro-mind-ai-windows/releases" -ForegroundColor Yellow
    Write-Host "for an updated adapter version." -ForegroundColor Yellow
    exit 1
} elseif ($script:Warnings -gt 0) {
    Write-Host "RESULT: ALL OK, $($script:Warnings) WARN" -ForegroundColor Yellow
    Write-Host "Adapter should work. Warnings may indicate upstream changes to monitor." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "RESULT: ALL OK" -ForegroundColor Green
    exit 0
}
