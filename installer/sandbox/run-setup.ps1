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
Start-Process -FilePath $setup.FullName -ArgumentList $args
