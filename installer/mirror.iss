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
Source: "assets\mirror.ico";  DestDir: "{app}\bin";                  Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#AppName}";            Filename: "{app}\bin\mirror.cmd"; WorkingDir: "{app}\app"; IconFilename: "{app}\bin\mirror.ico"
Name: "{userdesktop}\{#AppName}";      Filename: "{app}\bin\mirror.cmd"; WorkingDir: "{app}\app"; IconFilename: "{app}\bin\mirror.ico"; Tasks: desktopicon

[Run]
; Single VISIBLE orchestrator so the user sees a live progress panel and the
; window stays open on error (no silent "it flashed and said done").
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\bin\install.ps1"" -InstallDir ""{app}\app"" -MirrorUser ""{code:GetMirrorUser}"" -OpenRouterApiKey ""{code:GetOpenRouterKey}"" -RepoUrl ""{#RepoUrl}"" -RepoBranch ""{#RepoBranch}"""; \
  StatusMsg: "Installing Mirror - a progress window will open..."; \
  Flags: waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\bin"

[Code]
var
  UserPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  UserPage := CreateInputQueryPage(wpSelectDir,
    'Mirror Mind configuration',
    'Tell Mirror who you are and how to reach OpenRouter',
    'These are stored locally in a .env file inside your installation. ' +
    'OpenRouter powers memory embeddings and multi-LLM features (needs at least $5 in credits).');
  UserPage.Add('Your name (MIRROR_USER):', False);
  UserPage.Add('OpenRouter API key:', True);   { masked }
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
