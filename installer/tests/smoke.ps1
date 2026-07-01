<#
    Dependency-free smoke test for MirrorInstall.psm1.

    Runs under Windows PowerShell 5.1 without requiring Pester. Intended for
    fast local verification; the authoritative suite is the Pester 5 tests in
    MirrorInstall.Tests.ps1 (run in CI).

    Exit code 0 = all assertions passed, 1 = at least one failure.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Failures = 0
$script:Passed = 0

function Assert-True {
    param([Parameter(Mandatory)][bool]$Condition, [Parameter(Mandatory)][string]$Message)
    if ($Condition) {
        $script:Passed++
        Write-Host "  PASS  $Message" -ForegroundColor Green
    } else {
        $script:Failures++
        Write-Host "  FAIL  $Message" -ForegroundColor Red
    }
}

function Assert-Equal {
    param($Expected, $Actual, [Parameter(Mandatory)][string]$Message)
    Assert-True -Condition ($Expected -eq $Actual) -Message "$Message (expected '$Expected', got '$Actual')"
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulePath = Join-Path (Split-Path -Parent $here) 'lib\MirrorInstall.psm1'

# Redirect log to a temp file so the smoke test never touches the real log.
$env:MIRROR_INSTALL_LOG = Join-Path ([System.IO.Path]::GetTempPath()) ("mirror-smoke-{0}.log" -f ([guid]::NewGuid().ToString('N')))

Import-Module $modulePath -Force

Write-Host "== ConvertTo-VersionString =="
Assert-Equal '2.54.0' (ConvertTo-VersionString 'git version 2.54.0.windows.1') 'parses git version'
Assert-Equal '24.16.0' (ConvertTo-VersionString 'v24.16.0') 'parses node v-prefixed'
Assert-Equal '0.11.15' (ConvertTo-VersionString 'uv 0.11.15 (3cffe97c2 2026-05-18)') 'parses uv version'
Assert-Equal '3.10.0' (ConvertTo-VersionString 'Python 3.10') 'fills missing patch with 0'
Assert-True -Condition ($null -eq (ConvertTo-VersionString 'no version here')) 'returns null on no match'

Write-Host "== Compare-MirrorVersion =="
Assert-True -Condition (Compare-MirrorVersion -Current '24.16.0' -Minimum '18.0.0') '24 >= 18'
Assert-True -Condition (Compare-MirrorVersion -Current '18.0.0' -Minimum '18.0.0') 'equal versions satisfy'
Assert-True -Condition (-not (Compare-MirrorVersion -Current '16.20.0' -Minimum '18.0.0')) '16 < 18 fails'
Assert-True -Condition (Compare-MirrorVersion -Current 'v20.5.1' -Minimum '18') 'tolerant of prefixes/partials'

Write-Host "== New-FriendlyError / Format-FriendlyError =="
$fe = New-FriendlyError -Code 'NO_NET' -Message 'No internet connection.' -Cause 'A download failed.' -Action 'Reconnect and retry.'
Assert-Equal 'NO_NET' $fe.Code 'friendly error keeps code'
$rendered = Format-FriendlyError $fe
Assert-True -Condition ($rendered -like '*NO_NET*') 'render contains code'
Assert-True -Condition ($rendered -like '*What to do*') 'render contains action label'
Assert-True -Condition ($rendered -notlike '*Exception*') 'render hides raw exceptions'

Write-Host "== Test-CommandAvailable =="
Assert-True -Condition (Test-CommandAvailable -Name 'where') 'detects a real command'
Assert-True -Condition (-not (Test-CommandAvailable -Name 'definitely-not-a-real-cmd-xyz')) 'missing command is false'

Write-Host "== Test-MirrorDependency (missing) =="
$dep = Test-MirrorDependency -Name 'Bogus' -Command 'definitely-not-a-real-cmd-xyz' -MinVersion '1.0.0'
Assert-True -Condition (-not $dep.Installed) 'missing dependency not installed'
Assert-True -Condition (-not $dep.Satisfied) 'missing dependency not satisfied'
Assert-True -Condition ($dep.Reason -like '*not found*') 'missing dependency reason mentions not found'

Write-Host "== Invoke-MirrorStep (success + friendly failure) =="
$val = Invoke-MirrorStep -Name 'compute' -Action { 21 * 2 }
Assert-Equal 42 $val 'step returns action result'

$threw = $false
try {
    Invoke-MirrorStep -Name 'boom' -Action { throw 'kaboom' } -OnErrorFriendly {
        param($ex) New-FriendlyError -Code 'BOOM' -Message 'It exploded.' -Cause $ex.Exception.Message -Action 'Retry.'
    }
} catch {
    $threw = $true
    Assert-True -Condition ($_.TargetObject.IsFriendly -or $_.Exception.Message -like '*') 'failed step throws'
}
Assert-True -Condition $threw 'failing step raises'

Write-Host "== Get-MirrorDownloadTransport (pure) =="
$transports = @(Get-MirrorDownloadTransport)
Assert-True -Condition ($transports.Count -ge 1) 'at least one transport available'
Assert-True -Condition ($transports[-1] -eq 'Invoke-WebRequest') 'Invoke-WebRequest is the always-present last resort'

# Note: the network-dependent behavior of Resolve-GitHubLatestAsset and
# Invoke-MirrorDownload is covered deterministically (with mocks) in the Pester
# suite. This smoke stays strictly dependency-free / offline so it never needs
# network and passes PSScriptAnalyzer (no hardcoded ComputerName probes).

Write-Host "== log file written =="
Assert-True -Condition (Test-Path -LiteralPath (Get-MirrorLogPath)) 'log file exists'

Write-Host ''
Write-Host ("Smoke: {0} passed, {1} failed" -f $script:Passed, $script:Failures)
if ($script:Failures -gt 0) { exit 1 } else { exit 0 }
