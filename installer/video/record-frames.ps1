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
# Watch: a host-side photo of the Sandbox window every 15 s, so what the
# person at the keyboard would see (an error box, a window without focus) is
# on record and can be read during the run, not only the log from inside.
Add-Type -AssemblyName System.Drawing
Add-Type 'using System; using System.Runtime.InteropServices; public struct RECT { public int Left, Top, Right, Bottom; } public static class WR { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r); }'
$watch = "C:\VSCode\mirror-installer\.local\video\watch"
Remove-Item "$watch\*" -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Force $watch | Out-Null
$shotN = 0
function WatchShot {
    $w = Get-Process WindowsSandboxRemoteSession -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
    if (-not $w) { return }
    $r = New-Object RECT; [void][WR]::GetWindowRect($w.MainWindowHandle, [ref]$r)
    if ($r.Right - $r.Left -le 0) { return }
    $bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
    $script:shotN++
    $bmp.Save(("{0}\{1:D3}-{2}.png" -f $watch, $script:shotN, (Get-Date -Format "HHmmss"))); $g.Dispose(); $bmp.Dispose()
}
$t0 = Get-Date
try {
    while (((Get-Date) - $t0).TotalMinutes -lt $TimeoutMin) {
        Start-Sleep 15
        WatchShot
        $log = Get-Content "$out\demo\capture.log" -ErrorAction SilentlyContinue
        if ($log) { $log | Select-Object -Last 1 | Write-Host }
        if (($log -join "`n") -match "\] done$") { break }
    }
} finally {
    Remove-Item "$out\openrouter.key" -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    # Never Stop-Process the Sandbox: it leaves a vmmem orphan that holds every
    # mapped folder until vmcompute restarts. `wsb stop` shuts the VM down.
    $raw = (wsb list --raw 2>$null | Out-String | ConvertFrom-Json -ErrorAction SilentlyContinue)
    $envs = @($raw.WindowsSandboxEnvironments)
    foreach ($e in $envs) { $id = if ($e -is [string]) { $e } elseif ($e.Id) { $e.Id } else { $e.id }; if ($id) { Write-Host "wsb stop $id"; wsb stop --id "$id" 2>$null | Out-Null } }
    Start-Sleep 5
    if (Get-Process WindowsSandboxRemoteSession -ErrorAction SilentlyContinue) {
        Write-Host "sandbox still up after wsb stop; close its window by hand"
    }
}
Get-ChildItem "$out\demo\*.png" | ForEach-Object { "{0}  {1}" -f $_.Name, $_.Length }
