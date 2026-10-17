<#
.SYNOPSIS
    Inside Windows Sandbox: install Mirror Mind with the wizard driven by keys,
    photograph every page, open Mirror from the Desktop shortcut, ask it one
    thing, photograph the answer. Frames land in C:\Out\demo for the video.

.DESCRIPTION
    Started by MirrorDemo.wsb as the LogonCommand. Reads C:\Out\openrouter.key
    (written by the host just for the run). Nothing here touches the host.
    Frames are window captures (not full screen), so the player can frame them.
#>
$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public struct RECT { public int Left, Top, Right, Bottom; }
public static class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  public static IntPtr FindButton(IntPtr parent, string caption) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(parent, (h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (sb.ToString().Replace("&", "") == caption) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
}
"@
$Out = "C:\Out\demo"; New-Item -ItemType Directory -Force $Out | Out-Null
$Log = "$Out\capture.log"
function Say($m) { $l = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m; Write-Host $l; Add-Content $Log $l }
function FindWin([string]$titleLike, [int]$timeoutSec = 60) {
    for ($i = 0; $i -lt $timeoutSec * 2; $i++) {
        $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like $titleLike } | Select-Object -First 1
        if ($p) { return $p }
        Start-Sleep -Milliseconds 500
    }
    return $null
}
function Shot([IntPtr]$h, [string]$name) {
    Start-Sleep -Milliseconds 400
    $r = New-Object RECT; [void][W]::GetWindowRect($h, [ref]$r)
    $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
    if ($w -le 0 -or $hh -le 0) { Say "shot ${name}: empty rect"; return }
    $bmp = New-Object System.Drawing.Bitmap $w, $hh
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
    $bmp.Save("$Out\$name.png"); $g.Dispose(); $bmp.Dispose()
    Say "shot $name ($w x $hh)"
}
function Click([IntPtr]$parent, [string]$caption) {
    $b = [W]::FindButton($parent, $caption)
    if ($b -eq [IntPtr]::Zero) { Say "button not found: $caption"; return $false }
    [void][W]::PostMessage($b, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)   # BM_CLICK, asynchronous
    Say "click $caption"; return $true
}
function ClickInto([IntPtr]$h) {
    $r = New-Object RECT; [void][W]::GetWindowRect($h, [ref]$r)
    [void][W]::SetCursorPos([int](($r.Left + $r.Right) / 2), [int](($r.Top + $r.Bottom) / 2))
    [W]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 80; [W]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 400
}
function Keys($k) { [System.Windows.Forms.SendKeys]::Send($k); [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 300 }

# --- the key, written by the host for this run only ---------------------------
$key = (Get-Content "C:\Out\openrouter.key" -Raw -ErrorAction SilentlyContinue)
if ($key) { $key = $key.Trim() }
if (-not $key) { Say "no C:\Out\openrouter.key"; exit 1 }
$name = "Helena"

# --- 1. the wizard -------------------------------------------------------------
$setup = Get-ChildItem "C:\Setup\MirrorMind-Setup-*.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
Say "setup: $($setup.Name)"
# A quiet desktop: the Sandbox opens the LogonCommand console; minimize it.
$me = [W]::GetForegroundWindow(); [void][W]::ShowWindow($me, 6)
Start-Process $setup.FullName -ArgumentList "/LANG=pt", "/LOG=C:\Out\demo\setup.log", "/NAME=$name", "/KEYFILE=C:\Out\openrouter.key"
$wiz = FindWin "Mirror Mind*Instalador*" 60
if (-not $wiz) { Say "wizard window not found"; exit 1 }
$h = $wiz.MainWindowHandle
[void][W]::SetForegroundWindow($h); Start-Sleep 1
Shot $h "01-boas-vindas"
[void](Click $h "Instalar")
Start-Sleep 3
Shot $h "02-instalando-inicio"
# wait for bootstrap: the transcript's MIRRORDONE line
$t0 = Get-Date
$logs = "C:\Users\$env:USERNAME\AppData\Local\Programs\MirrorMind\logs"
$mid = $false
while (((Get-Date) - $t0).TotalMinutes -lt 20) {
    Start-Sleep 2
    $tr = Get-Content "$logs\install-bootstrap.log" -ErrorAction SilentlyContinue
    if (-not $mid -and ($tr -join "`n") -match "== Git for Windows") { Shot $h "03-instalando-meio"; $mid = $true }
    if (($tr -join "`n") -match "MIRRORDONE:") { break }
}
Start-Sleep 2
Shot $h "04-instalando-fim"
Start-Sleep 2                   # Inno moves to the next page on its own
Shot $h "05-quase-la"
[void](Click $h "Avançar")
Start-Sleep 4
Shot $h "06-configurando"
$t0 = Get-Date
while (((Get-Date) - $t0).TotalMinutes -lt 10) {
    Start-Sleep 2
    if (((Get-Content "$logs\install-configure.log" -ErrorAction SilentlyContinue) -join "`n") -match "MIRRORDONE:") { break }
}
Start-Sleep -Milliseconds 800
$cfg = (Get-Content "$logs\install-configure.log" -ErrorAction SilentlyContinue) -join "`n"
if ($cfg -notmatch "MIRRORDONE:0") {
    Shot $h "07-erro"
    Say "configure failed; stopping (see 07-erro.png and install-configure.log)"
    Copy-Item "$logs\*" $Out -Force -ErrorAction SilentlyContinue
    Say "done"
    exit 1
}
Shot $h "07-concluido"
Start-Sleep 2
Shot $h "07b-concluido"
# Concluir with "Abrir o Mirror Mind" checked runs mirror.cmd (the fixed [Run] entry).
[void](Click $h "Concluir")
Start-Sleep 2
Say "clicked Concluir; Mirror should open from the Run entry"

# --- 2. Mirror opens -----------------------------------------------------------
$pi = FindWin "*Mirror*" 60
if (-not $pi) { $pi = FindWin "*pi*" 20 }
if ($pi) {
    $ph = $pi.MainWindowHandle
    [void][W]::MoveWindow($ph, 60, 40, 1100, 680, $true)
    [void][W]::SetForegroundWindow($ph)
    Start-Sleep 30              # first start downloads fd/ripgrep, then the welcome card
    Shot $ph "08-mirror-abre"
    ClickInto $ph
    if ([W]::GetForegroundWindow() -ne $ph) { Say "Pi window has no focus; not typing"; Shot $ph "09-sem-foco" }
    else {
    foreach ($ch in 'listar minhas personas'.ToCharArray()) { [System.Windows.Forms.SendKeys]::SendWait($ch); Start-Sleep -Milliseconds 60 }
    Start-Sleep 1
    Shot $ph "09-pergunta"
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep 20
    Shot $ph "10-resposta"
    Start-Sleep 25
    Shot $ph "11-resposta-final"
    }
} else { Say "Mirror window not found" }

# desktop with the shortcut
Keys "^{ESC}"; Start-Sleep 1; Keys "{ESC}"; Start-Sleep 1
[void][W]::ShowWindow($ph, 6); Start-Sleep 1
$scr = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $scr.Width, $scr.Height
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0, 0, 0, 0, $bmp.Size); $bmp.Save("$Out\12-desktop.png"); $g.Dispose()
Copy-Item "$logs\*" $Out -Force -ErrorAction SilentlyContinue
Say "done"
