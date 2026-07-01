<#
    Pester 5 tests for MirrorInstall.psm1.

    Run locally:   Invoke-Pester -Path installer\tests\MirrorInstall.Tests.ps1
    In CI:         see .github\workflows\windows-installer.yml

    These mirror installer\tests\smoke.ps1 but use Pester assertions and add
    mocked-install coverage for the friendly-error paths.
#>

BeforeAll {
    $modulePath = Join-Path $PSScriptRoot '..\lib\MirrorInstall.psm1'
    $env:MIRROR_INSTALL_LOG = Join-Path ([System.IO.Path]::GetTempPath()) ("mirror-pester-{0}.log" -f ([guid]::NewGuid().ToString('N')))
    Import-Module $modulePath -Force
}

Describe 'ConvertTo-VersionString' {
    It 'parses git version output' { ConvertTo-VersionString 'git version 2.54.0.windows.1' | Should -Be '2.54.0' }
    It 'parses node v-prefixed'    { ConvertTo-VersionString 'v24.16.0' | Should -Be '24.16.0' }
    It 'parses uv version'         { ConvertTo-VersionString 'uv 0.11.15 (abc 2026)' | Should -Be '0.11.15' }
    It 'fills missing patch'       { ConvertTo-VersionString 'Python 3.10' | Should -Be '3.10.0' }
    It 'accepts a bare major'      { ConvertTo-VersionString '18' | Should -Be '18.0.0' }
    It 'returns null on no match'  { ConvertTo-VersionString 'no version here' | Should -BeNullOrEmpty }
    It 'returns null on empty'     { ConvertTo-VersionString '' | Should -BeNullOrEmpty }
}

Describe 'Compare-MirrorVersion' {
    It 'greater satisfies'  { Compare-MirrorVersion -Current '24.16.0' -Minimum '18.0.0' | Should -BeTrue }
    It 'equal satisfies'    { Compare-MirrorVersion -Current '18.0.0' -Minimum '18.0.0' | Should -BeTrue }
    It 'lesser fails'       { Compare-MirrorVersion -Current '16.20.0' -Minimum '18.0.0' | Should -BeFalse }
    It 'tolerates prefixes' { Compare-MirrorVersion -Current 'v20.5.1' -Minimum '18' | Should -BeTrue }
    It 'unparsable fails'   { Compare-MirrorVersion -Current 'x' -Minimum '1.0.0' | Should -BeFalse }
}

Describe 'Friendly errors' {
    It 'keeps the code' {
        (New-FriendlyError -Code 'NO_NET' -Message 'x').Code | Should -Be 'NO_NET'
    }
    It 'renders code, action and log path, and hides raw exceptions' {
        $fe = New-FriendlyError -Code 'NO_NET' -Message 'No internet.' -Cause 'download failed' -Action 'Reconnect.'
        $out = Format-FriendlyError $fe
        $out | Should -Match 'NO_NET'
        $out | Should -Match 'What to do'
        $out | Should -Match 'log is available'
        $out | Should -Not -Match 'Exception'
    }
}

Describe 'Test-CommandAvailable' {
    It 'detects a real command'  { Test-CommandAvailable -Name 'where' | Should -BeTrue }
    It 'rejects a missing one'   { Test-CommandAvailable -Name 'nope-xyz-123' | Should -BeFalse }
}

Describe 'Test-MirrorDependency' {
    It 'reports a missing dependency' {
        $d = Test-MirrorDependency -Name 'Bogus' -Command 'nope-xyz-123' -MinVersion '1.0.0'
        $d.Installed | Should -BeFalse
        $d.Satisfied | Should -BeFalse
        $d.Reason    | Should -Match 'not found'
    }
}

Describe 'Invoke-MirrorStep' {
    It 'returns the action result on success' {
        Invoke-MirrorStep -Name 'ok' -Action { 21 * 2 } | Should -Be 42
    }
    It 'wraps failures in a friendly error object' {
        $caught = $null
        try {
            Invoke-MirrorStep -Name 'boom' -Action { throw 'kaboom' } -OnErrorFriendly {
                param($ex) New-FriendlyError -Code 'BOOM' -Message 'exploded' -Cause $ex.Exception.Message
            }
        } catch { $caught = $_ }
        $caught | Should -Not -BeNullOrEmpty
        $caught.TargetObject.IsFriendly | Should -BeTrue
        $caught.TargetObject.Friendly.Code | Should -Be 'BOOM'
    }
}

Describe 'Logging' {
    It 'writes a line to the configured log' {
        Write-MirrorLog -Message 'hello' -Level INFO | Out-Null
        (Get-Content -LiteralPath (Get-MirrorLogPath) -Raw) | Should -Match 'hello'
    }
}
