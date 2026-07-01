; ===========================================================================
; Mirror Mind - Windows installer (Inno Setup 6)
;
; Layout under the install base ({app} = %LOCALAPPDATA%\Programs\MirrorMind):
;   {app}\bin\            -> launcher + a copy of the bootstrap scripts
;   {app}\app\            -> the git clone of the Mirror repository
;
; Flow:
;   1. Wizard collects MIRROR_USER + OPENROUTER_API_KEY.
;   2. bootstrap.ps1 installs prerequisites (Git, Node, uv, Pi) and clones/syncs
;      the repo into {app}\app.
;   3. configure.ps1 writes .env, initializes identity, validates OpenRouter.
;   4. A Desktop shortcut points at {app}\bin\mirror.cmd.
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
  #define RepoBranch "main"
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

[Code]
const
  EM_SCROLLCARET = $00B7;

function SendMessage(Wnd: LongInt; Msg: LongInt; wParam: LongInt; lParam: LongInt): LongInt;
  external 'SendMessageW@user32.dll stdcall';

var
  UserPage: TInputQueryWizardPage;
  LogMemo: TNewMemo;

procedure InitializeWizard;
begin
  UserPage := CreateInputQueryPage(wpSelectDir,
    'Mirror Mind configuration',
    'Tell Mirror who you are and how to reach OpenRouter',
    'These are stored locally in a .env file inside your installation. ' +
    'OpenRouter powers memory embeddings and multi-LLM features (needs at least $5 in credits).');
  UserPage.Add('Your name (MIRROR_USER):', False);
  UserPage.Add('OpenRouter API key:', True);   { masked }

  { A live progress memo embedded on the standard Installing page, so all output
    is shown INSIDE the wizard window (no separate console). }
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
end;

function GetMirrorUser(Param: String): String;
begin
  Result := Trim(UserPage.Values[0]);
end;

function GetOpenRouterKey(Param: String): String;
begin
  Result := Trim(UserPage.Values[1]);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
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
  end;
end;

procedure UpdateMemo(const Content: String);
begin
  LogMemo.Lines.Text := Content;
  LogMemo.SelStart := Length(Content);
  SendMessage(LogMemo.Handle, EM_SCROLLCARET, 0, 0);
  LogMemo.Update;
end;

procedure RunInstall;
var
  WrapperPath, LogPath, AppDir, Wrapper: String;
  Content, Shown: AnsiString;
  ResultCode, DonePos, Ticks, ExitCode: Integer;
  CodeStr: String;
begin
  AppDir := ExpandConstant('{app}');
  WrapperPath := ExpandConstant('{tmp}\run-install.cmd');
  LogPath := AppDir + '\install-transcript.log';

  Wrapper :=
    '@echo off' + #13#10 +
    'chcp 65001 >nul' + #13#10 +
    'powershell -NoProfile -ExecutionPolicy Bypass -File "' + AppDir + '\bin\install.ps1"' +
    ' -InstallDir "' + AppDir + '\app"' +
    ' -MirrorUser "' + GetMirrorUser('') + '"' +
    ' -OpenRouterApiKey "' + GetOpenRouterKey('') + '"' +
    ' -RepoUrl "{#RepoUrl}"' +
    ' -RepoBranch "{#RepoBranch}"' +
    ' > "' + LogPath + '" 2>&1' + #13#10 +
    'echo MIRRORDONE:%ERRORLEVEL%>>"' + LogPath + '"' + #13#10;
  SaveStringToFile(WrapperPath, Wrapper, False);

  LogMemo.Visible := True;
  WizardForm.StatusLabel.Caption :=
    'Installing Mirror (prerequisites, download, configuration). This can take a few minutes...';
  UpdateMemo('Starting installation...');

  if not Exec(ExpandConstant('{cmd}'), '/C "' + WrapperPath + '"', '', SW_HIDE, ewNoWait, ResultCode) then
  begin
    UpdateMemo('Could not start the installation process.');
    MsgBox('Mirror Mind could not start the installation process.', mbError, MB_OK);
    Exit;
  end;

  Content := '';
  Shown := '';
  DonePos := 0;
  Ticks := 0;
  { Poll the transcript and mirror it into the embedded memo until the wrapper
    writes its MIRRORDONE marker, or a generous 30-minute safety timeout. }
  repeat
    Sleep(400);
    Ticks := Ticks + 1;
    if LoadStringFromFile(LogPath, Content) then
    begin
      if Content <> Shown then
      begin
        UpdateMemo(Content);
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

  if ExitCode = 0 then
  begin
    WizardForm.StatusLabel.Caption := 'Mirror Mind installed successfully.';
  end
  else
  begin
    WizardForm.StatusLabel.Caption := 'Mirror Mind installation did not finish.';
    MsgBox('The installation did not finish successfully.' + #13#10 +
      'The details are shown in the window, and a full log is at:' + #13#10 +
      LogPath + #13#10 + #13#10 +
      'You can re-run the installer to try again.', mbError, MB_OK);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    RunInstall;
end;
