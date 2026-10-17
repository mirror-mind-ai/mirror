<#
.SYNOPSIS
    Host side of the demo capture: write the key for the run, start the
    Sandbox, wait for the frames, close the Sandbox, remove the key.
    Nothing is installed on the host.
#>
param([int]$TimeoutMin = 25)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = "C:\VSCode\mirror-installer\.local\sandbox-out"
New-Item -ItemType Directory -Force $out | Out-Null
Remove-Item "$out\*" -Recurse -Force -ErrorAction SilentlyContinue
# The daily runtime's env holds the key (never committed); ~/.config/mirror/env only names the user.
$env = Get-Content "C:\VSCode\mirror\.env" -ErrorAction Stop
$key = ($env | Where-Object { $_ -match '^OPENROUTER_API_KEY=' }) -replace '^OPENROUTER_API_KEY=', ''
if (-not $key) { throw "no OPENROUTER_API_KEY in C:\VSCode\mirror\.env" }
[IO.File]::WriteAllText("$out\openrouter.key", $key.Trim(), (New-Object Text.UTF8Encoding $false))
$sb = Start-Process "WindowsSandbox.exe" -ArgumentList "`"$here\MirrorDemo.wsb`"" -PassThru
# The Sandbox is a VM shown over RDP: what is not on screen is not drawn, and
# captures taken inside come back white. Keep its window restored, maximized
# and in front for the whole run. Do not cover it.
Add-Type 'using System; using System.Runtime.InteropServices; public static class SW { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd); }'
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 2
    $win = Get-Process WindowsSandboxRemoteSession -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
    if ($win) { [void][SW]::ShowWindow($win.MainWindowHandle, 9); [void][SW]::ShowWindow($win.MainWindowHandle, 3); [void][SW]::SetForegroundWindow($win.MainWindowHandle); Write-Host "sandbox window up, maximized"; break }
}
$t0 = Get-Date
try {
    while (((Get-Date) - $t0).TotalMinutes -lt $TimeoutMin) {
        Start-Sleep 10
        $log = Get-Content "$out\demo\capture.log" -ErrorAction SilentlyContinue
        if ($log) { $log | Select-Object -Last 1 | Write-Host }
        if (($log -join "`n") -match "\] done$") { break }
    }
} finally {
    Remove-Item "$out\openrouter.key" -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    Get-Process WindowsSandbox* -ErrorAction SilentlyContinue | Stop-Process -Force
}
Get-ChildItem "$out\demo\*.png" | ForEach-Object { "{0}  {1}" -f $_.Name, $_.Length }
