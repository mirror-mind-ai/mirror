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
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

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
    'Set up your Mirror',
    'Two last things Mirror needs to run',
    'Mirror is installed on your computer. Before you start, it needs:' + #13#10 + #13#10 +
    '1) Your name - Mirror keeps a private memory and identity for you on THIS ' +
    'computer. Your name is simply how Mirror knows which identity to load. ' +
    'Nothing is uploaded; it is saved in a local .env file in your installation.' + #13#10 + #13#10 +
    '2) An OpenRouter API key - Mirror uses AI models through OpenRouter to ' +
    'create memory embeddings, extract what matters from your conversations, ' +
    'and power its multi-model features. You need an OpenRouter account with at ' +
    'least US$5 in credits. Get a key at https://openrouter.ai/keys');
  UserPage.Add('Your name (MIRROR_USER):', False);
  UserPage.Add('OpenRouter API key:', True);   { masked }

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
      MsgBox('Please enter your name (MIRROR_USER).', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Trim(UserPage.Values[1]) = '' then
    begin
      MsgBox('Please enter your OpenRouter API key.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    WizardForm.StatusLabel.Caption := 'Configuring your Mirror identity...';
    rc := RunPhase('configure', Trim(UserPage.Values[0]), Trim(UserPage.Values[1]), ConfigMemo);
    if rc <> 0 then
    begin
      MsgBox('Configuration did not finish successfully.' + #13#10 +
        'The details are shown above, and a full log is at:' + #13#10 +
        DetailLogPath + #13#10 + #13#10 +
        'Check your OpenRouter key/credits and try again.', mbError, MB_OK);
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
    WizardForm.StatusLabel.Caption :=
      'Installing prerequisites and downloading Mirror. This can take a few minutes...';
    UpdateMemoCtrl(LogMemo, 'Starting...');
    BootstrapOk := (RunPhase('bootstrap', '', '', LogMemo) = 0);
    if BootstrapOk then
      WizardForm.StatusLabel.Caption := 'Prerequisites installed and Mirror downloaded.'
    else
    begin
      WizardForm.StatusLabel.Caption := 'Mirror Mind installation did not finish.';
      MsgBox('The installation did not finish successfully.' + #13#10 +
        'A full log is at:' + #13#10 + DetailLogPath + #13#10 + #13#10 +
        'You can re-run the installer to try again.', mbError, MB_OK);
    end;
  end;
end;
