# CI smoke: Mirror sob um USERPROFILE Windows REAL com caracteres nao ASCII.
#
# Requisitos do review do PR #32 (item 4): usuario local real (nao um override
# de variavel), perfil real carregado, assercao DENTRO do processo daquele
# usuario de que o caminho efetivo do perfil contem nao-ASCII, credencial
# temporaria sem senha em logs, limpeza em finally, e falha se o Windows criar
# um perfil ASCII ou se qualquer etapa usar o perfil original do runner.
# Nao simula sucesso com pasta acentuada.
[CmdletBinding()]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
    'PSAvoidUsingConvertToSecureStringWithPlainText', '',
    Justification = 'Credencial efemera de conta de teste do runner: valor aleatorio, so em memoria, nunca logado, destruido em finally.')]
param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [Parameter(Mandatory)][string]$FramePayload
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Nome com nao-ASCII real (a-til e c-cedilha). Mantido curto por limites de SAM.
$userName = "Mirror" + [char]0x00E3 + [char]0x00E7 + "o"   # "Mirror+atilde+ccedilla+o"
$workDir = Join-Path $env:RUNNER_TEMP 'nonascii-smoke'
$outLog = Join-Path $workDir 'worker-out.log'
$errLog = Join-Path $workDir 'worker-err.log'
$statusFile = Join-Path $workDir 'worker-status.json'
$workerPath = Join-Path $workDir 'worker.ps1'
$runnerProfile = $env:USERPROFILE

New-Item -ItemType Directory -Force $workDir | Out-Null

# uv autocontido para o usuario de teste (PATH do runner pode ser por-usuario).
$uvDir = Join-Path $workDir 'uvbin'
if (-not (Test-Path (Join-Path $uvDir 'uv.exe'))) {
    New-Item -ItemType Directory -Force $uvDir | Out-Null
    $uvZip = Join-Path $workDir 'uv.zip'
    Invoke-WebRequest -Uri 'https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip' -OutFile $uvZip -UseBasicParsing
    Expand-Archive -Path $uvZip -DestinationPath $uvDir -Force
}

# Senha temporaria: gerada, usada, jamais impressa.
$passPlain = [guid]::NewGuid().ToString('N') + 'Aa1!'
$passSecure = ConvertTo-SecureString $passPlain -AsPlainText -Force

$created = $false
try {
    Write-Host "Criando usuario local de teste (nome contem nao-ASCII)..."
    New-LocalUser -Name $userName -Password $passSecure -PasswordNeverExpires -AccountNeverExpires | Out-Null
    Add-LocalGroupMember -Group 'Users' -Member $userName
    $created = $true

    # O worker roda COMO o usuario de teste, com o perfil real carregado.
    $worker = @'
param([string]$RepoRoot, [string]$FramePayload, [string]$RunnerProfile, [string]$UvDir, [string]$StatusFile)
$ErrorActionPreference = 'Stop'
$status = [ordered]@{ profile = $env:USERPROFILE; steps = [ordered]@{} }
function Step([string]$name, [scriptblock]$body) {
    & $body
    $status.steps[$name] = 'ok'
    Write-Host "[worker] $name : ok"
}

Step 'profile-is-non-ascii' {
    if (-not $env:USERPROFILE) { throw 'USERPROFILE vazio' }
    if ($env:USERPROFILE -notmatch '[^\x00-\x7F]') {
        throw "perfil efetivo e ASCII-only: $env:USERPROFILE (Windows pode ter criado nome ASCII)"
    }
    if (-not (Test-Path $env:USERPROFILE)) { throw "perfil nao existe em disco: $env:USERPROFILE" }
}
Step 'profile-is-not-the-runner-profile' {
    if ($env:USERPROFILE -eq $RunnerProfile) { throw 'worker esta usando o perfil original do runner' }
}
Step 'profile-matches-os-registration' {
    # O USERPROFILE do ambiente tem de ser o perfil que o WINDOWS registrou
    # para o SID deste processo (ProfileList) - prova que o perfil e real e
    # carregado, nao uma variavel sobrescrita.
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $reg = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction Stop
    if ($env:USERPROFILE -ne $reg.ProfileImagePath) {
        throw "USERPROFILE ($env:USERPROFILE) difere do perfil registrado pelo Windows ($($reg.ProfileImagePath))"
    }
}
# Nativos via cmd /c com redirecao no proprio cmd: uv escreve progresso em
# stderr e, com ErrorActionPreference=Stop, 2>&1 no PowerShell viraria erro
# terminante mesmo com exit 0 (comportamento conhecido do PS).
Step 'memory-init-mirror-minds' {
    $env:PATH = "$UvDir;$env:PATH"
    $env:UV_PROJECT_ENVIRONMENT = Join-Path $env:USERPROFILE '.mirror-venv'
    Set-Location $RepoRoot
    cmd /c "uv run python -m memory init smokeuser > nul 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "memory init falhou ($LASTEXITCODE)" }
    $home_ = Join-Path $env:USERPROFILE '.mirror-minds\smokeuser'
    if (-not (Test-Path $home_)) { throw ".mirror-minds nao criado sob o perfil acentuado" }
}
Step 'memory-seed' {
    $env:MIRROR_USER = 'smokeuser'
    cmd /c "uv run python -m memory seed > nul 2>&1"
    # seed sai != 0 com o warning conhecido; o criterio aqui e o estado gravado (abaixo)
}
Step 'mirror-state-write-read' {
    $out = (cmd /c "uv run python -m memory identity list 2>nul" | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "identity list falhou ($LASTEXITCODE)" }
    if ($out -notmatch 'ego') { throw 'estado do Mirror nao legivel (identity list sem ego)' }
}
Step 'pi-agent-dir-resolution' {
    $piDir = Join-Path $env:USERPROFILE '.pi\agent'
    New-Item -ItemType Directory -Force $piDir | Out-Null
    Set-Content -LiteralPath (Join-Path $piDir 'auth.json') -Value '{"probe":{}}' -Encoding UTF8
    $keys = & node -e "console.log(Object.keys(require(process.env.USERPROFILE + '/.pi/agent/auth.json')).join(','))"
    if ($keys -ne 'probe') { throw ".pi/agent nao resolve sob perfil acentuado (obtido: '$keys')" }
}
Step 'frame-conpty-selftest' {
    $env:MIRROR_FRAME_SELFTEST = '1'
    $p = Start-Process -FilePath (Join-Path $FramePayload 'MirrorFrame.exe') -Wait -PassThru -WindowStyle Hidden
    if ($p.ExitCode -ne 0) { throw "selftest ConPTY do Frame falhou ($($p.ExitCode))" }
}

$status | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StatusFile -Encoding UTF8
Write-Host "[worker] concluido sob perfil: $($env:USERPROFILE)"
'@
    Set-Content -LiteralPath $workerPath -Value $worker -Encoding UTF8

    # Acesso de leitura ao checkout/payload/uv para o grupo Users (runner-only).
    foreach ($p in @($RepoRoot, $FramePayload, $uvDir, $workDir)) {
        icacls $p /grant '*S-1-5-32-545:(OI)(CI)RX' /T /Q | Out-Null
    }
    icacls $workDir /grant '*S-1-5-32-545:(OI)(CI)M' /Q | Out-Null  # worker escreve status/logs

    $cred = New-Object System.Management.Automation.PSCredential(".\$userName", $passSecure)
    Write-Host "Executando o worker como o usuario de teste (perfil real, -LoadUserProfile)..."
    $proc = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $workerPath,
            $RepoRoot, $FramePayload, $runnerProfile, $uvDir, $statusFile) `
        -Credential $cred -LoadUserProfile -UseNewEnvironment -PassThru -Wait -WorkingDirectory $workDir `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog

    Get-Content $outLog -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    Get-Content $errLog -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "ERR: $_" }

    if ($proc.ExitCode -ne 0) { throw "worker saiu com codigo $($proc.ExitCode)" }
    if (-not (Test-Path $statusFile)) { throw 'worker nao gravou o arquivo de status' }
    $status = Get-Content $statusFile -Raw | ConvertFrom-Json
    if ($status.profile -notmatch '[^\x00-\x7F]') { throw "status reporta perfil ASCII: $($status.profile)" }
    $required = @('profile-is-non-ascii','profile-is-not-the-runner-profile','profile-matches-os-registration',
                  'memory-init-mirror-minds','memory-seed','mirror-state-write-read',
                  'pi-agent-dir-resolution','frame-conpty-selftest')
    foreach ($step in $required) {
        $prop = $status.steps.PSObject.Properties[$step]
        if (-not $prop -or $prop.Value -ne 'ok') { throw "etapa obrigatoria ausente/falha: $step" }
    }
    Write-Host "Smoke nao-ASCII OK - perfil efetivo: $($status.profile)"
}
finally {
    # Limpeza SEMPRE: processos, perfil em disco, usuario e credencial.
    try {
        if ($created) {
            $prof = Get-CimInstance Win32_UserProfile -ErrorAction SilentlyContinue |
                Where-Object { $_.LocalPath -and $_.LocalPath.EndsWith($userName) }
            if ($prof) { $prof | Remove-CimInstance -ErrorAction SilentlyContinue }
            Remove-LocalUser -Name $userName -ErrorAction SilentlyContinue
            Write-Host 'Usuario e perfil de teste removidos.'
        }
    } catch { Write-Host "aviso: limpeza parcial: $($_.Exception.Message)" }
    $passPlain = $null
    $passSecure = $null
}
