; ===========================================================================
; Mirror Mind - Windows installer v2 (Inno Setup 6), over the npm package.
;
; Layout under {app} = %LOCALAPPDATA%\Programs\MirrorMind (per-user, no UAC):
;   {app}\node\   Node 24 (zip) -- also npm's global prefix, so Pi and
;                 mirror-mind live in {app}\node\node_modules
;   {app}\git\    Git for Windows, portable: the bash Pi's tools need
;   {app}\bin\    launcher, status, the install script (kept for repair)
;   {app}\logs\   transcripts of both phases, kept for support
;
; The person's data is NOT under {app} and the uninstaller never touches it:
;   %USERPROFILE%\.mirror-minds\<user>\   identity, memory.db
;   %USERPROFILE%\.config\mirror\env      MIRROR_USER, OPENROUTER_API_KEY
;   %USERPROFILE%\.pi\agent\              Pi settings and sessions
;   %USERPROFILE%\Mirror\                 the workspace Pi opens in
;
; Flow (identity is asked at the END, after the heavy work succeeds):
;   1. "Installing": install.ps1 -Phase bootstrap (Node, Git, Pi, mirror-mind)
;   2. "Set up your Mirror": name + OpenRouter key, with a button to the
;      OpenRouter keys page; install.ps1 -Phase configure validates the key,
;      writes the config, runs init + seed + pi install, points Pi at
;      OpenRouter (one key for chat AND memory, no /login) and at Git Bash.
;   3. "Finished": optionally launch Mirror.
;
; The first installer (PR #26, v0.30.0) cloned the repository and installed
; Git, Node, uv and Pi; v0.32.0 retired it with the Python core. This one is
; what remains when the product is an npm package.
; Build:  powershell -File installer\build.ps1
; ===========================================================================
#define AppName "Mirror Mind"
#define AppPublisher "Mirror Mind"
#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif
#ifndef OutputSuffix
  #define OutputSuffix ""
#endif
#ifndef MirrorVersion
  #define MirrorVersion "latest"
#endif

[Setup]
AppId={{7E2C0A2B-3D5E-4C9A-9F1B-MIRRORMIND02}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\MirrorMind
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=MirrorMind-Setup-{#AppVersion}{#OutputSuffix}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=100,130
WizardImageFile=assets\wizard-large.bmp
WizardImageStretch=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
ShowLanguageDialog=yes
UninstallDisplayName={#AppName}

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "install.ps1";                DestDir: "{app}\bin"; Flags: ignoreversion
Source: "launcher\mirror.cmd";        DestDir: "{app}\bin"; Flags: ignoreversion
Source: "launcher\mirror-status.cmd"; DestDir: "{app}\bin"; Flags: ignoreversion
; Wizard banner illustration, extracted to {tmp} and loaded by [Code].
Source: "assets\wizard-banner.bmp"; Flags: dontcopy

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\bin\mirror.cmd";        WorkingDir: "{%USERPROFILE}\Mirror"
Name: "{group}\{#AppName} - Status"; Filename: "{app}\bin\mirror-status.cmd"; WorkingDir: "{app}"
Name: "{userdesktop}\{#AppName}";    Filename: "{app}\bin\mirror.cmd";        WorkingDir: "{%USERPROFILE}\Mirror"; Tasks: desktopicon

[Run]
Filename: "{app}\bin\mirror.cmd"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent shellexec; Check: ConfigureDone

[UninstallDelete]
Type: filesandordirs; Name: "{app}\node"
Type: filesandordirs; Name: "{app}\git"
Type: filesandordirs; Name: "{app}\bin"
Type: filesandordirs; Name: "{app}\logs"

[UninstallRun]
; The user PATH entries the install added. Data under the profile stays.
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""$p=[Environment]::GetEnvironmentVariable('Path','User'); $keep=($p -split ';' | Where-Object {{ $_ -and ($_ -notlike '{app}\*') }}) -join ';'; [Environment]::SetEnvironmentVariable('Path',$keep,'User')"""; Flags: runhidden; RunOnceId: "MirrorMindPath"

[Code]
const
  EM_SCROLLCARET = $00B7;

function SendMessage(Wnd: LongInt; Msg: LongInt; wParam: LongInt; lParam: LongInt): LongInt;
  external 'SendMessageW@user32.dll stdcall';

var
  IdPage: TWizardPage;
  BannerImage: TBitmapImage;
  LangLabel, BodyText, NameLabel, KeyLabel: TNewStaticText;
  LangCombo: TNewComboBox;
  NameEdit: TNewEdit;
  KeyEdit: TPasswordEdit;
  KeysButton: TNewButton;
  LogMemo: TNewMemo;           { bootstrap transcript, on the Installing page }
  ConfigMemo: TNewMemo;        { configure transcript, on the identity page }
  BootstrapOk, ConfigOk: Boolean;
  CurLang: String;             { 'en' or 'pt' }
  AppBinDir, AppLogsDir, DetailLogPath: String;

function ConfigureDone: Boolean;
begin
  Result := ConfigOk;
end;

{ Texts without accents on purpose: the .iss is read as ANSI by the compiler. }
function L(const Key: String): String;
begin
  Result := '';
  if CurLang = 'pt' then
  begin
    if Key = 'title' then Result := 'Configure seu Mirror'
    else if Key = 'subtitle' then Result := 'Duas ultimas coisas para o Mirror funcionar'
    else if Key = 'body' then Result :=
      'O Mirror foi instalado. Faltam duas coisas antes de comecar:' + #13#10 + #13#10 +
      '1) Seu nome - uma identidade e memoria privadas, guardadas somente NESTE computador. Nada e enviado para a internet.' + #13#10 + #13#10 +
      '2) Uma chave da OpenRouter - UMA conta cuida da conversa com a IA e da memoria do Mirror. Crie a conta, coloque US$5 de credito e gere uma chave (o botao ao lado do campo abre a pagina certa).'
    else if Key = 'name' then Result := 'Seu nome:'
    else if Key = 'key' then Result := 'Chave da OpenRouter (sk-or-...):'
    else if Key = 'keysbtn' then Result := 'Criar conta / gerar chave...'
    else if Key = 'lang' then Result := 'Idioma:'
    else if Key = 'needname' then Result := 'Por favor, informe seu nome.'
    else if Key = 'badname' then Result := 'Use apenas letras, numeros, espaco, ponto, hifen ou sublinhado no nome.'
    else if Key = 'needkey' then Result := 'Por favor, informe sua chave da OpenRouter. Ela comeca com sk-or-.'
    else if Key = 'configuring' then Result := 'Configurando o seu Mirror...'
    else if Key = 'installing' then Result := 'Instalando Node.js, Git, Pi e Mirror Mind. Isso leva alguns minutos...'
    else if Key = 'installed' then Result := 'Tudo instalado.'
    else if Key = 'failed' then Result := 'A instalacao do Mirror Mind nao foi concluida.'
    else if Key = 'cfgfail' then Result := 'A configuracao nao foi concluida.' + #13#10 + 'Os detalhes aparecem acima e um log completo esta em:'
    else if Key = 'cfghint' then Result := 'Verifique sua chave e os creditos da OpenRouter e tente novamente.'
    else if Key = 'instfail' then Result := 'A instalacao nao foi concluida.' + #13#10 + 'Um log completo esta em:'
    else if Key = 'insthint' then Result := 'Verifique a conexao com a internet e execute o instalador novamente.'
    else if Key = 'finished' then Result := 'O Mirror abre em uma janela de terminal. Na primeira vez, converse normalmente: ele ja conhece seu nome e aprende com cada conversa. Digite /mm-help para ver os comandos.';
  end
  else
  begin
    if Key = 'title' then Result := 'Set up your Mirror'
    else if Key = 'subtitle' then Result := 'Two last things Mirror needs to run'
    else if Key = 'body' then Result :=
      'Mirror is installed. Two last things before you start:' + #13#10 + #13#10 +
      '1) Your name - a private identity and memory kept only on THIS computer. Nothing is uploaded.' + #13#10 + #13#10 +
      '2) An OpenRouter key - ONE account covers the AI conversation and Mirror''s memory. Create the account, add US$5 of credit and generate a key (the button beside the field opens the right page).'
    else if Key = 'name' then Result := 'Your name:'
    else if Key = 'key' then Result := 'OpenRouter key (sk-or-...):'
    else if Key = 'keysbtn' then Result := 'Create account / get a key...'
    else if Key = 'lang' then Result := 'Language:'
    else if Key = 'needname' then Result := 'Please enter your name.'
    else if Key = 'badname' then Result := 'Use only letters, digits, space, dot, hyphen or underscore in the name.'
    else if Key = 'needkey' then Result := 'Please enter your OpenRouter key. It starts with sk-or-.'
    else if Key = 'configuring' then Result := 'Configuring your Mirror...'
    else if Key = 'installing' then Result := 'Installing Node.js, Git, Pi and Mirror Mind. This takes a few minutes...'
    else if Key = 'installed' then Result := 'Everything installed.'
    else if Key = 'failed' then Result := 'Mirror Mind installation did not finish.'
    else if Key = 'cfgfail' then Result := 'Configuration did not finish.' + #13#10 + 'The details are shown above, and a full log is at:'
    else if Key = 'cfghint' then Result := 'Check your OpenRouter key and credits and try again.'
    else if Key = 'instfail' then Result := 'The installation did not finish.' + #13#10 + 'A full log is at:'
    else if Key = 'insthint' then Result := 'Check your internet connection and run the installer again.'
    else if Key = 'finished' then Result := 'Mirror opens in a terminal window. The first time, just talk: it already knows your name and learns from every conversation. Type /mm-help to see the commands.';
  end;
end;

procedure ApplyLang();
begin
  IdPage.Caption := L('title');
  IdPage.Description := L('subtitle');
  if WizardForm.CurPageID = IdPage.ID then
  begin
    WizardForm.PageNameLabel.Caption := L('title');
    WizardForm.PageDescriptionLabel.Caption := L('subtitle');
  end;
  BodyText.Caption := L('body');
  NameLabel.Caption := L('name');
  KeyLabel.Caption := L('key');
  KeysButton.Caption := L('keysbtn');
  LangLabel.Caption := L('lang');
end;

procedure LangComboChange(Sender: TObject);
begin
  if LangCombo.ItemIndex = 1 then CurLang := 'pt' else CurLang := 'en';
  ApplyLang();
end;

procedure KeysButtonClick(Sender: TObject);
var
  rc: Integer;
begin
  ShellExec('open', 'https://openrouter.ai/keys', '', '', SW_SHOWNORMAL, ewNoWait, rc);
end;

procedure EnsurePaths();
begin
  if AppBinDir = '' then
  begin
    AppBinDir := ExpandConstant('{app}\bin');
    AppLogsDir := ExpandConstant('{app}\logs');
    ForceDirectories(AppLogsDir);
    DetailLogPath := AppLogsDir + '\install-detail-' +
      GetDateTimeString('yyyymmdd-hhnnss', '-', '-') + '.log';
  end;
end;

procedure InitializeWizard;
var
  SW, SH: Integer;
begin
  BootstrapOk := False;
  ConfigOk := False;
  if Lowercase(ActiveLanguage()) = 'pt' then CurLang := 'pt' else CurLang := 'en';

  { Identity page created AFTER the Installing page, so it appears at the END. }
  IdPage := CreateCustomPage(wpInstalling, L('title'), L('subtitle'));
  SW := IdPage.SurfaceWidth;
  SH := IdPage.SurfaceHeight;

  ExtractTemporaryFile('wizard-banner.bmp');
  BannerImage := TBitmapImage.Create(WizardForm);
  BannerImage.Parent := IdPage.Surface;
  BannerImage.Bitmap.LoadFromFile(ExpandConstant('{tmp}\wizard-banner.bmp'));
  BannerImage.Stretch := True;
  BannerImage.Width := ScaleX(192);
  BannerImage.Height := ScaleY(64);
  BannerImage.Left := 0;
  BannerImage.Top := 0;

  LangCombo := TNewComboBox.Create(WizardForm);
  LangCombo.Parent := IdPage.Surface;
  LangCombo.Style := csDropDownList;
  LangCombo.Width := ScaleX(160);
  LangCombo.Left := SW - LangCombo.Width;
  LangCombo.Top := BannerImage.Top + (BannerImage.Height - LangCombo.Height) div 2;
  LangCombo.Items.Add('English');
  LangCombo.Items.Add('Portugues (Brasil)');
  if CurLang = 'pt' then LangCombo.ItemIndex := 1 else LangCombo.ItemIndex := 0;
  LangCombo.OnChange := @LangComboChange;

  LangLabel := TNewStaticText.Create(WizardForm);
  LangLabel.Parent := IdPage.Surface;
  LangLabel.AutoSize := True;
  LangLabel.Top := LangCombo.Top + ScaleY(3);
  LangLabel.Left := LangCombo.Left - ScaleX(72);

  { Fields anchored to the bottom; the body fills the middle. }
  KeyEdit := TPasswordEdit.Create(WizardForm);
  KeyEdit.Parent := IdPage.Surface;
  KeyEdit.Left := 0;
  KeyEdit.Width := SW - ScaleX(170);
  KeyEdit.Top := SH - ScaleY(23);

  KeysButton := TNewButton.Create(WizardForm);
  KeysButton.Parent := IdPage.Surface;
  KeysButton.Width := ScaleX(164);
  KeysButton.Height := ScaleY(23);
  KeysButton.Left := SW - KeysButton.Width;
  KeysButton.Top := KeyEdit.Top;
  KeysButton.OnClick := @KeysButtonClick;

  KeyLabel := TNewStaticText.Create(WizardForm);
  KeyLabel.Parent := IdPage.Surface;
  KeyLabel.AutoSize := True;
  KeyLabel.Left := 0;
  KeyLabel.Top := KeyEdit.Top - ScaleY(16);

  NameEdit := TNewEdit.Create(WizardForm);
  NameEdit.Parent := IdPage.Surface;
  NameEdit.Left := 0;
  NameEdit.Width := SW;
  NameEdit.Top := KeyLabel.Top - ScaleY(30);
  NameEdit.Text := GetUserNameString();

  NameLabel := TNewStaticText.Create(WizardForm);
  NameLabel.Parent := IdPage.Surface;
  NameLabel.AutoSize := True;
  NameLabel.Left := 0;
  NameLabel.Top := NameEdit.Top - ScaleY(16);

  BodyText := TNewStaticText.Create(WizardForm);
  BodyText.Parent := IdPage.Surface;
  BodyText.AutoSize := False;
  BodyText.WordWrap := True;
  BodyText.Left := 0;
  BodyText.Width := SW;
  BodyText.Top := BannerImage.Top + BannerImage.Height + ScaleY(12);
  BodyText.Height := NameLabel.Top - BodyText.Top - ScaleY(6);

  ConfigMemo := TNewMemo.Create(WizardForm);
  ConfigMemo.Parent := IdPage.Surface;
  ConfigMemo.Left := 0;
  ConfigMemo.Width := SW;
  ConfigMemo.Top := BodyText.Top;
  ConfigMemo.Height := BodyText.Height;
  ConfigMemo.ScrollBars := ssVertical;
  ConfigMemo.ReadOnly := True;
  ConfigMemo.WantReturns := False;
  ConfigMemo.Font.Name := 'Consolas';
  ConfigMemo.Font.Size := 8;
  ConfigMemo.Visible := False;

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

  ApplyLang();
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = IdPage.ID then
  begin
    WizardForm.PageNameLabel.Caption := L('title');
    WizardForm.PageDescriptionLabel.Caption := L('subtitle');
    if KeyEdit.Text = '' then WizardForm.ActiveControl := KeyEdit;
  end;
  if (CurPageID = wpFinished) and ConfigOk then
    WizardForm.FinishedLabel.Caption :=
      WizardForm.FinishedLabel.Caption + #13#10 + #13#10 + L('finished');
end;

procedure UpdateMemoCtrl(Memo: TNewMemo; const Content: String);
begin
  Memo.Lines.Text := Content;
  Memo.SelStart := Length(Content);
  SendMessage(Memo.Handle, EM_SCROLLCARET, 0, 0);
  Memo.Update;
end;

{ Run one phase (bootstrap|configure): powershell.exe directly, no cmd wrapper.
  The first wrapper was a .cmd that began with chcp 65001; a code page change
  inside a batch makes cmd re-read the file with the new one, so an install
  directory with accents (C:\Users\Joao Cao Silva) turned to garbage, the
  transcript was never written, and the wizard waited out its 30 minutes.
  PowerShell receives its arguments as Unicode and writes the transcript and
  the MIRRORDONE line itself. The key travels as an argument of a hidden
  child; it is not written to any log. }
function RunPhase(Phase, UserVal, KeyVal: String; Memo: TNewMemo): Integer;
var
  TranscriptLog, Args, IdentityArgs: String;
  Content, Shown: AnsiString;
  ResultCode, DonePos, Ticks, ExitCode: Integer;
  CodeStr: String;
begin
  EnsurePaths();
  TranscriptLog := AppLogsDir + '\install-' + Phase + '.log';
  DeleteFile(TranscriptLog);
  if (UserVal <> '') or (KeyVal <> '') then
    IdentityArgs := ' -MirrorUser "' + UserVal + '" -OpenRouterApiKey "' + KeyVal + '"'
  else
    IdentityArgs := '';

  Args :=
    '-NoProfile -ExecutionPolicy Bypass -File "' + AppBinDir + '\install.ps1"' +
    ' -Phase ' + Phase +
    ' -InstallDir "' + ExpandConstant('{app}') + '"' +
    ' -MirrorVersion "{#MirrorVersion}"' +
    ' -TranscriptLog "' + TranscriptLog + '"' +
    ' -DetailLog "' + DetailLogPath + '"' +
    IdentityArgs;

  if Memo <> nil then
  begin
    Memo.Visible := True;
    UpdateMemoCtrl(Memo, 'Starting...');
  end;

  if not Exec('powershell.exe', Args, '', SW_HIDE, ewNoWait, ResultCode) then
  begin
    if Memo <> nil then UpdateMemoCtrl(Memo, 'Could not start the process.');
    Result := -1;
    Exit;
  end;

  Content := '';
  Shown := '';
  DonePos := 0;
  Ticks := 0;
  { Poll the transcript until the MIRRORDONE marker or a 30-minute safety timeout. }
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

function ValidName(const S: String): Boolean;
var
  i: Integer;
begin
  Result := Length(S) > 0;
  for i := 1 to Length(S) do
    if Pos(S[i], 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ._-') = 0 then
      Result := False;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = IdPage.ID) and (not BootstrapOk) then
    Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  rc: Integer;
begin
  Result := True;
  if CurPageID = IdPage.ID then
  begin
    if Trim(NameEdit.Text) = '' then
    begin
      MsgBox(L('needname'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if not ValidName(Trim(NameEdit.Text)) then
    begin
      MsgBox(L('badname'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Pos('sk-or-', Trim(KeyEdit.Text)) <> 1 then
    begin
      MsgBox(L('needkey'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    WizardForm.StatusLabel.Caption := L('configuring');
    BodyText.Visible := False;
    ConfigMemo.Visible := True;
    WizardForm.NextButton.Enabled := False;
    WizardForm.BackButton.Enabled := False;
    rc := RunPhase('configure', Trim(NameEdit.Text), Trim(KeyEdit.Text), ConfigMemo);
    WizardForm.NextButton.Enabled := True;
    WizardForm.BackButton.Enabled := True;
    ConfigOk := (rc = 0);
    if not ConfigOk then
    begin
      MsgBox(L('cfgfail') + #13#10 + DetailLogPath + #13#10 + #13#10 + L('cfghint'), mbError, MB_OK);
      ConfigMemo.Visible := False;
      BodyText.Visible := True;
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
    WizardForm.StatusLabel.Caption := L('installing');
    UpdateMemoCtrl(LogMemo, 'Starting...');
    BootstrapOk := (RunPhase('bootstrap', '', '', LogMemo) = 0);
    if BootstrapOk then
      WizardForm.StatusLabel.Caption := L('installed')
    else
    begin
      WizardForm.StatusLabel.Caption := L('failed');
      MsgBox(L('instfail') + #13#10 + DetailLogPath + #13#10 + #13#10 + L('insthint'), mbError, MB_OK);
    end;
  end;
end;
