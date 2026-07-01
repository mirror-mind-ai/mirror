; ===========================================================================
; Mirror Mind - Windows installer (Inno Setup 6)
;
; Layout under the install base ({app} = %LOCALAPPDATA%\Programs\MirrorMind):
;   {app}\bin\            -> launcher + a copy of the bootstrap scripts
;   {app}\app\            -> the git clone of the Mirror repository
;
; Flow (identity is asked at the END, after the heavy work succeeds):
;   1. bootstrap.ps1 installs prerequisites (Git, Node, uv, Pi) and clones/syncs
;      the 'stable' release branch into {app}\app (shallow clone, keeps .git so
;      'memory runtime update' fast-forwards in place without a reinstall).
;   2. A final wizard page explains WHY Mirror needs a name + OpenRouter key and
;      collects them.
;   3. configure.ps1 writes .env, initializes identity, validates OpenRouter.
;   4. A Desktop shortcut points at {app}\bin\mirror.cmd.
;   Logs for future analysis are kept under {app}\logs\.
;
; Per-user install (PrivilegesRequired=lowest) so no admin elevation is needed.
; Build:  iscc installer\mirror.iss   (see installer\build.ps1)
; ===========================================================================

#define AppName "Mirror Mind"
#define AppPublisher "Mirror Mind"
#ifndef AppVersion
  #define AppVersion "0.29.1"
#endif
#ifndef RepoUrl
  #define RepoUrl "https://github.com/mirror-mind-ai/mirror.git"
#endif
#ifndef RepoBranch
  #define RepoBranch "stable"
#endif

[Setup]
AppId={{7E2C0A2B-3D5E-4C9A-9F1B-MIRRORMIND01}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\MirrorMind
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=MirrorMind-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardImageFile=assets\wizard-large.bmp
WizardSmallImageFile=assets\wizard-small.bmp
WizardImageStretch=yes
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
ShowLanguageDialog=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[CustomMessages]
; --- English ---
en.PageTitle=Set up your Mirror
en.PageSubtitle=Two last things Mirror needs to run
en.BodyIntro=Mirror is installed on your computer. Before you start, it needs:
en.BodyName=1) Your name - Mirror keeps a private memory and identity for you on THIS computer. Your name is simply how Mirror knows which identity to load. Nothing is uploaded; it is saved in a local .env file in your installation.
en.BodyKey=2) An OpenRouter API key - Mirror uses AI models through OpenRouter to create memory embeddings, extract what matters from your conversations, and power its multi-model features. You need an OpenRouter account with at least US$5 in credits. Get a key at https://openrouter.ai/keys
en.FieldName=Your name (MIRROR_USER):
en.FieldKey=OpenRouter API key:
en.NeedName=Please enter your name (MIRROR_USER).
en.NeedKey=Please enter your OpenRouter API key.
en.StatusConfiguring=Configuring your Mirror identity...
en.StatusInstalling=Installing prerequisites and downloading Mirror. This can take a few minutes...
en.StatusInstalled=Prerequisites installed and Mirror downloaded.
en.StatusFailed=Mirror Mind installation did not finish.
en.ConfigFailedHead=Configuration did not finish successfully.
en.ConfigFailedLog=The details are shown above, and a full log is at:
en.ConfigFailedHint=Check your OpenRouter key/credits and try again.
en.InstallFailedHead=The installation did not finish successfully.
en.InstallFailedLog=A full log is at:
en.InstallFailedHint=You can re-run the installer to try again.
; --- Portugues (Brasil) --- (sem acentos para compatibilidade de codificacao)
pt.PageTitle=Configure seu Mirror
pt.PageSubtitle=Duas ultimas coisas que o Mirror precisa para funcionar
pt.BodyIntro=O Mirror foi instalado no seu computador. Antes de comecar, ele precisa de:
pt.BodyName=1) Seu nome - o Mirror mantem uma memoria e identidade privadas para voce NESTE computador. Seu nome e simplesmente como o Mirror sabe qual identidade carregar. Nada e enviado para a internet; fica salvo em um arquivo .env local na sua instalacao.
pt.BodyKey=2) Uma chave de API da OpenRouter - o Mirror usa modelos de IA pela OpenRouter para criar embeddings de memoria, extrair o que importa das suas conversas e habilitar os recursos multi-modelo. Voce precisa de uma conta na OpenRouter com pelo menos US$5 de credito. Pegue uma chave em https://openrouter.ai/keys
pt.FieldName=Seu nome (MIRROR_USER):
pt.FieldKey=Chave de API da OpenRouter:
pt.NeedName=Por favor, informe seu nome (MIRROR_USER).
pt.NeedKey=Por favor, informe sua chave de API da OpenRouter.
pt.StatusConfiguring=Configurando a identidade do seu Mirror...
pt.StatusInstalling=Instalando pre-requisitos e baixando o Mirror. Isso pode levar alguns minutos...
pt.StatusInstalled=Pre-requisitos instalados e Mirror baixado.
pt.StatusFailed=A instalacao do Mirror Mind nao foi concluida.
pt.ConfigFailedHead=A configuracao nao foi concluida com sucesso.
pt.ConfigFailedLog=Os detalhes aparecem acima e um log completo esta em:
pt.ConfigFailedHint=Verifique sua chave/creditos da OpenRouter e tente novamente.
pt.InstallFailedHead=A instalacao nao foi concluida com sucesso.
pt.InstallFailedLog=Um log completo esta em:
pt.InstallFailedHint=Voce pode executar o instalador novamente para tentar de novo.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Ship the bootstrap scripts + launcher so they run before (and after) the clone.
Source: "lib\*";              DestDir: "{app}\bin\lib";              Flags: recursesubdirs ignoreversion
Source: "launcher\mirror.cmd"; DestDir: "{app}\bin";                 Flags: ignoreversion
Source: "bootstrap.ps1";      DestDir: "{app}\bin";                  Flags: ignoreversion
Source: "configure.ps1";      DestDir: "{app}\bin";                  Flags: ignoreversion
Source: "install.ps1";        DestDir: "{app}\bin";                  Flags: ignoreversion
Source: "health-check.ps1";   DestDir: "{app}\bin";                  Flags: ignoreversion
Source: "assets\mirror.ico";  DestDir: "{app}\bin";                  Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}";            Filename: "{app}\bin\mirror.cmd"; WorkingDir: "{app}\app"; IconFilename: "{app}\bin\mirror.ico"
Name: "{group}\{#AppName} Health Check"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -NoExit -File ""{app}\bin\health-check.ps1"" -InstallDir ""{app}"""; WorkingDir: "{app}\app"
Name: "{userdesktop}\{#AppName}";      Filename: "{app}\bin\mirror.cmd"; WorkingDir: "{app}\app"; IconFilename: "{app}\bin\mirror.ico"; Tasks: desktopicon

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\bin"
Type: filesandordirs; Name: "{app}\logs"

[Code]
const
  EM_SCROLLCARET = $00B7;

function SendMessage(Wnd: LongInt; Msg: LongInt; wParam: LongInt; lParam: LongInt): LongInt;
  external 'SendMessageW@user32.dll stdcall';

var
  UserPage: TInputQueryWizardPage;
  LogMemo: TNewMemo;      { bootstrap progress, on the Installing page }
  ConfigMemo: TNewMemo;   { configure progress, on the final identity page }
  BootstrapOk: Boolean;
  AppBinDir, AppCloneDir, AppLogsDir, DetailLogPath: String;

procedure EnsurePaths();
begin
  if AppBinDir = '' then
  begin
    AppBinDir := ExpandConstant('{app}\bin');
    AppCloneDir := ExpandConstant('{app}\app');
    AppLogsDir := ExpandConstant('{app}\logs');
    ForceDirectories(AppLogsDir);
    { One shared, timestamped detail log across both phases, kept for analysis. }
    DetailLogPath := AppLogsDir + '\install-detail-' +
      GetDateTimeString('yyyymmdd-hhnnss', '-', '-') + '.log';
  end;
end;

procedure InitializeWizard;
begin
  BootstrapOk := False;

  { Identity page created AFTER the Installing page, so it appears at the END,
    once prerequisites and the Mirror download have already succeeded. }
  UserPage := CreateInputQueryPage(wpInstalling,
    ExpandConstant('{cm:PageTitle}'),
    ExpandConstant('{cm:PageSubtitle}'),
    ExpandConstant('{cm:BodyIntro}') + #13#10 + #13#10 +
    ExpandConstant('{cm:BodyName}') + #13#10 + #13#10 +
    ExpandConstant('{cm:BodyKey}'));
  UserPage.Add(ExpandConstant('{cm:FieldName}'), False);
  UserPage.Add(ExpandConstant('{cm:FieldKey}'), True);   { masked }

  { Live progress memo on the standard Installing page (bootstrap phase). }
  LogMemo := TNewMemo.Create(WizardForm);
  LogMemo.Parent := WizardForm.ProgressGauge.Parent;
  LogMemo.Left := WizardForm.ProgressGauge.Left;
  LogMemo.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(8);
  LogMemo.Width := WizardForm.ProgressGauge.Width;
  LogMemo.Height := ScaleY(150);
  LogMemo.ScrollBars := ssVertical;
  LogMemo.ReadOnly := True;
  LogMemo.WantReturns := False;
  LogMemo.Font.Name := 'Consolas';
  LogMemo.Font.Size := 8;
  LogMemo.Visible := False;

  { Live progress memo on the final identity page (configure phase). }
  ConfigMemo := TNewMemo.Create(WizardForm);
  ConfigMemo.Parent := UserPage.Surface;
  ConfigMemo.Left := 0;
  ConfigMemo.Width := UserPage.SurfaceWidth;
  ConfigMemo.Top := UserPage.Edits[1].Top + UserPage.Edits[1].Height + ScaleY(16);
  ConfigMemo.Height := UserPage.SurfaceHeight - ConfigMemo.Top - ScaleY(4);
  ConfigMemo.ScrollBars := ssVertical;
  ConfigMemo.ReadOnly := True;
  ConfigMemo.WantReturns := False;
  ConfigMemo.Font.Name := 'Consolas';
  ConfigMemo.Font.Size := 8;
  ConfigMemo.Visible := False;
end;

procedure UpdateMemoCtrl(Memo: TNewMemo; const Content: String);
begin
  Memo.Lines.Text := Content;
  Memo.SelStart := Length(Content);
  SendMessage(Memo.Handle, EM_SCROLLCARET, 0, 0);
  Memo.Update;
end;

{ Run one install phase (bootstrap|configure) via a temp wrapper, streaming its
  transcript into the given memo, and return the child exit code. }
function RunPhase(Phase, UserVal, KeyVal: String; Memo: TNewMemo): Integer;
var
  WrapperPath, TranscriptLog, Wrapper, IdentityArgs: String;
  Content, Shown: AnsiString;
  ResultCode, DonePos, Ticks, ExitCode: Integer;
  CodeStr: String;
begin
  EnsurePaths();
  TranscriptLog := AppLogsDir + '\install-' + Phase + '.log';
  if (UserVal <> '') or (KeyVal <> '') then
    IdentityArgs := ' -MirrorUser "' + UserVal + '" -OpenRouterApiKey "' + KeyVal + '"'
  else
    IdentityArgs := '';

  WrapperPath := ExpandConstant('{tmp}\run-' + Phase + '.cmd');
  Wrapper :=
    '@echo off' + #13#10 +
    'chcp 65001 >nul' + #13#10 +
    'set "MIRROR_INSTALL_LOG=' + DetailLogPath + '"' + #13#10 +
    'powershell -NoProfile -ExecutionPolicy Bypass -File "' + AppBinDir + '\install.ps1"' +
    ' -Phase ' + Phase +
    ' -InstallDir "' + AppCloneDir + '"' +
    IdentityArgs +
    ' -RepoUrl "{#RepoUrl}"' +
    ' -RepoBranch "{#RepoBranch}"' +
    ' > "' + TranscriptLog + '" 2>&1' + #13#10 +
    'echo MIRRORDONE:%ERRORLEVEL%>>"' + TranscriptLog + '"' + #13#10;
  SaveStringToFile(WrapperPath, Wrapper, False);

  if Memo <> nil then
  begin
    Memo.Visible := True;
    UpdateMemoCtrl(Memo, 'Starting...');
  end;

  if not Exec(ExpandConstant('{cmd}'), '/C "' + WrapperPath + '"', '', SW_HIDE, ewNoWait, ResultCode) then
  begin
    if Memo <> nil then UpdateMemoCtrl(Memo, 'Could not start the process.');
    Result := -1;
    Exit;
  end;

  Content := '';
  Shown := '';
  DonePos := 0;
  Ticks := 0;
  { Poll the phase transcript into the memo until the MIRRORDONE marker or a
    generous 30-minute safety timeout. }
  repeat
    Sleep(400);
    Ticks := Ticks + 1;
    if LoadStringFromFile(TranscriptLog, Content) then
    begin
      if (Memo <> nil) and (Content <> Shown) then
      begin
        UpdateMemoCtrl(Memo, Content);
        Shown := Content;
      end;
    end;
    DonePos := Pos('MIRRORDONE:', Content);
  until (DonePos > 0) or (Ticks > 4500);

  if DonePos > 0 then
  begin
    CodeStr := Trim(Copy(Content, DonePos + Length('MIRRORDONE:'), 10));
    ExitCode := StrToIntDef(CodeStr, -1);
  end
  else
    ExitCode := -1;
  Result := ExitCode;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  { If bootstrap failed, do not ask for identity - nothing to configure. }
  if (PageID = UserPage.ID) and (not BootstrapOk) then
    Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  rc: Integer;
begin
  Result := True;
  if CurPageID = UserPage.ID then
  begin
    if Trim(UserPage.Values[0]) = '' then
    begin
      MsgBox(ExpandConstant('{cm:NeedName}'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Trim(UserPage.Values[1]) = '' then
    begin
      MsgBox(ExpandConstant('{cm:NeedKey}'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    WizardForm.StatusLabel.Caption := ExpandConstant('{cm:StatusConfiguring}');
    rc := RunPhase('configure', Trim(UserPage.Values[0]), Trim(UserPage.Values[1]), ConfigMemo);
    if rc <> 0 then
    begin
      MsgBox(ExpandConstant('{cm:ConfigFailedHead}') + #13#10 +
        ExpandConstant('{cm:ConfigFailedLog}') + #13#10 +
        DetailLogPath + #13#10 + #13#10 +
        ExpandConstant('{cm:ConfigFailedHint}'), mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    EnsurePaths();
    LogMemo.Visible := True;
    WizardForm.StatusLabel.Caption := ExpandConstant('{cm:StatusInstalling}');
    UpdateMemoCtrl(LogMemo, 'Starting...');
    BootstrapOk := (RunPhase('bootstrap', '', '', LogMemo) = 0);
    if BootstrapOk then
      WizardForm.StatusLabel.Caption := ExpandConstant('{cm:StatusInstalled}')
    else
    begin
      WizardForm.StatusLabel.Caption := ExpandConstant('{cm:StatusFailed}');
      MsgBox(ExpandConstant('{cm:InstallFailedHead}') + #13#10 +
        ExpandConstant('{cm:InstallFailedLog}') + #13#10 + DetailLogPath + #13#10 + #13#10 +
        ExpandConstant('{cm:InstallFailedHint}'), mbError, MB_OK);
    end;
  end;
end;
