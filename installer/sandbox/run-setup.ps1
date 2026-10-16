<#
.SYNOPSIS
    Start the Mirror Mind installer inside Windows Sandbox, optionally under a
    simulated Brazilian profile.

.DESCRIPTION
    -PerfilPT creates C:\Users\João Çãõ Silva and points USERPROFILE, HOME,
    APPDATA and LOCALAPPDATA at it before starting the setup with /LANG=pt and
    /DIR under that profile. Node, npm, Git, Pi and mirror then work with a
    path carrying a space, ç, ã and õ -- the class of path that made every
    install `unknown` (PR #42) and that a Sandbox, whose user is
    WDAGUtilityAccount, never exercises on its own. The name is built from
    character codes so this file reads the same under any encoding.
#>
param([switch]$PerfilPT)

$setup = Get-ChildItem "C:\Setup\MirrorMind-Setup-*.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $setup) { Write-Host "no MirrorMind-Setup-*.exe in C:\Setup"; Read-Host; exit 1 }

$args = @('/LOG="C:\Out\setup.log"')
# install.ps1 mirrors its detail log here, line by line; inherited by the setup and its children.
$env:MIRROR_LOG_DIR = "C:\Out"
if ($PerfilPT) {
    $name = "Jo" + [char]0xE3 + "o " + [char]0xC7 + [char]0xE3 + [char]0xF5 + " Silva"
    $profile = "C:\Users\$name"
    foreach ($d in @("$profile\AppData\Roaming", "$profile\AppData\Local", "$profile\Desktop")) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
    }
    $env:USERPROFILE = $profile
    $env:HOME = $profile
    $env:APPDATA = "$profile\AppData\Roaming"
    $env:LOCALAPPDATA = "$profile\AppData\Local"
    $args += "/LANG=pt"
    $args += ('/DIR="{0}\AppData\Local\Programs\MirrorMind"' -f $profile)
    Write-Host "Perfil simulado: $profile"
}
Write-Host "Starting $($setup.Name) $($args -join ' ')"
$p = Start-Process -FilePath $setup.FullName -ArgumentList $args -PassThru
$p.WaitForExit()

# Bring the installer's own logs out to the host (C:\Out is mapped), so the
# failure can be read without copying anything from inside the Sandbox.
$appDir = if ($PerfilPT) { "$profile\AppData\Local\Programs\MirrorMind" } else { "$env:LOCALAPPDATA\Programs\MirrorMind" }
if (Test-Path "$appDir\logs") { Copy-Item "$appDir\logs\*" "C:\Out\" -Force }
$mirrorHome = if ($PerfilPT) { $profile } else { $env:USERPROFILE }
$report = @{
    exitCode = $p.ExitCode
    appDir = $appDir
    appDirExists = (Test-Path $appDir)
    mirrorMinds = @(Get-ChildItem "$mirrorHome\.mirror-minds" -Directory -ErrorAction SilentlyContinue | ForEach-Object Name)
    envFile = @(Get-ChildItem "$mirrorHome\.mirror-minds\*\.env" -ErrorAction SilentlyContinue | ForEach-Object FullName)
    piSettings = (Test-Path "$mirrorHome\.pi\agent\settings.json")
} | ConvertTo-Json
[IO.File]::WriteAllText("C:\Out\report.json", $report, (New-Object Text.UTF8Encoding $false))
Write-Host $report
