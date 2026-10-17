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
; Welcome -> [Install] -> Installing -> identity -> Finished. No Tasks page
; (the Desktop shortcut is always made; it is per-user and one Delete away)
; and no Ready page (there is nothing to confirm).
DisableWelcomePage=no
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=MirrorMind-Setup-{#AppVersion}{#OutputSuffix}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=100,130
WizardImageFile=assets\wizard-large.bmp,assets\wizard-large-200.bmp
WizardImageStretch=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
SetupIconFile=assets\mirror.ico
WizardSmallImageFile=assets\wizard-small.bmp,assets\wizard-small-200.bmp
UninstallDisplayIcon={app}\bin\mirror.ico
ShowLanguageDialog=yes
UninstallDisplayName={#AppName}

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "install.ps1";                DestDir: "{app}\bin"; Flags: ignoreversion
Source: "launcher\mirror.cmd";        DestDir: "{app}\bin"; Flags: ignoreversion
Source: "launcher\mirror-status.cmd"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "assets\mirror.ico";          DestDir: "{app}\bin"; Flags: ignoreversion
; Wizard banner illustration, extracted to {tmp} and loaded by [Code].
Source: "assets\wizard-banner.bmp"; Flags: dontcopy

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\bin\mirror.cmd";        WorkingDir: "{%USERPROFILE}\Mirror"; IconFilename: "{app}\bin\mirror.ico"
Name: "{group}\{#AppName} - Status"; Filename: "{app}\bin\mirror-status.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\bin\mirror.ico"
Name: "{userdesktop}\{#AppName}";    Filename: "{app}\bin\mirror.cmd";        WorkingDir: "{%USERPROFILE}\Mirror"; IconFilename: "{app}\bin\mirror.ico"

[Run]
; No Check: here. Inno evaluates Check functions when it builds this list, right
; after the install step, and ConfigureDone is only known after the identity
; page that follows. CurPageChanged hides the item instead when configure failed.
Filename: "{app}\bin\mirror.cmd"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent shellexec

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
  NameHint: TNewStaticText;    { the key the name becomes, live }
  KeyEdit: TPasswordEdit;
  KeysButton: TNewButton;
  LogMemo: TNewMemo;           { bootstrap transcript, on the Installing page }
  ConfigMemo: TNewMemo;        { configure transcript, on the identity page }
  BootstrapOk, ConfigOk: Boolean;
  CurLang: String;             { 'en' or 'pt' }
  AppBinDir, AppLogsDir, DetailLogPath: String;


{ Texts without accents on purpose: the .iss is read as ANSI by the compiler. }
{ Copy for the identity page and the progress pages. Written as a person
  would say it across a desk: one idea per sentence, the why before the how,
  privacy said once and calmly. The file is UTF-8 with BOM so the Portuguese
  keeps its accents; Inno 6 reads it. }
function L(const Key: String): String;
begin
  Result := '';
  if CurLang = 'pt' then
  begin
    if Key = 'welcome1' then Result := 'Bem-vindo ao Mirror Mind'
    else if Key = 'welcome2' then Result :=
      'Este assistente instala o Mirror Mind neste computador, só para o seu usuário. Não pede senha de administrador.' + #13#10 + #13#10 +
      'Ele baixa e prepara o que o Mirror precisa (Node.js, Git e Pi). No fim, pergunta duas coisas: como você quer ser chamado e uma chave da OpenRouter, o serviço de IA.' + #13#10 + #13#10 +
      'Leva uns cinco minutos e precisa de internet.' + #13#10 + #13#10 +
      'Clique em Instalar para começar.'
    else if Key = 'title' then Result := 'Quase lá'
    else if Key = 'subtitle' then Result := 'Falta só dizer quem é você e conectar a IA'
    else if Key = 'body' then Result :=
      'O Mirror é um espelho que conversa: guarda o que importa das suas conversas e usa isso para pensar junto com você.' + #13#10 + #13#10 +
      'Sua memória fica neste computador, numa pasta com o seu nome. Ela não é enviada para lugar nenhum.' + #13#10 + #13#10 +
      'Para conversar, o Mirror usa um serviço de IA chamado OpenRouter. Uma conta serve para tudo: crie, coloque US$ 5 de crédito e gere uma chave. O botão ao lado abre a página certa.'
    else if Key = 'name' then Result := 'Como você quer ser chamado?'
    else if Key = 'key' then Result := 'Sua chave da OpenRouter (começa com sk-or-):'
    else if Key = 'keysbtn' then Result := 'Criar conta e gerar chave…'
    else if Key = 'lang' then Result := 'Idioma:'
    else if Key = 'needname' then Result := 'Escreva o seu nome para continuar.'
    else if Key = 'badname' then Result := 'O nome precisa ter ao menos uma letra ou número.'
    else if Key = 'askey' then Result := 'No Mirror: %s'
    else if Key = 'needkey' then Result := 'Cole a chave da OpenRouter para continuar. Ela começa com sk-or-.'
    else if Key = 'configuring' then Result := 'Preparando o seu Mirror…'
    else if Key = 'installing' then Result := 'Instalando Node.js, Git e Pi. Leva alguns minutos.'
    else if Key = 'installed' then Result := 'Tudo pronto.'
    else if Key = 'failed' then Result := 'A instalação do Mirror Mind não terminou.'
    else if Key = 'cfgfail' then Result := 'A configuração parou no meio.' + #13#10 + 'O motivo aparece acima; o registro completo está em:'
    else if Key = 'cfghint' then Result := 'Na maioria das vezes é a chave (copiada incompleta) ou a conta da OpenRouter sem crédito. Confira e tente de novo.'
    else if Key = 'instfail' then Result := 'A instalação parou no meio.' + #13#10 + 'O registro completo está em:'
    else if Key = 'insthint' then Result := 'Confira a conexão com a internet e rode o instalador de novo. Ele continua de onde parou.'
    else if Key = 'finished' then Result := 'O Mirror abre numa janela de texto. Converse como conversaria com alguém: ele já sabe seu nome e aprende a cada conversa. Se quiser ver o que ele sabe fazer, digite /mm-help.';
  end
  else
  begin
    if Key = 'welcome1' then Result := 'Welcome to Mirror Mind'
    else if Key = 'welcome2' then Result :=
      'This wizard installs Mirror Mind on this computer, for your user only. No administrator password is needed.' + #13#10 + #13#10 +
      'It downloads and prepares what Mirror needs (Node.js, Git and Pi). At the end it asks two things: what to call you, and a key for OpenRouter, the AI service.' + #13#10 + #13#10 +
      'It takes about five minutes and needs an internet connection.' + #13#10 + #13#10 +
      'Click Install to begin.'
    else if Key = 'title' then Result := 'Almost there'
    else if Key = 'subtitle' then Result := 'Say who you are and connect the AI'
    else if Key = 'body' then Result :=
      'Mirror is a mirror that talks back: it keeps what matters from your conversations and uses it to think alongside you.' + #13#10 + #13#10 +
      'Your memory stays on this computer, in a folder under your name. It is not sent anywhere.' + #13#10 + #13#10 +
      'To talk, Mirror uses an AI service called OpenRouter. One account does it all: create it, add US$5 of credit and generate a key. The button beside the field opens the right page.'
    else if Key = 'name' then Result := 'What should Mirror call you?'
    else if Key = 'key' then Result := 'Your OpenRouter key (starts with sk-or-):'
    else if Key = 'keysbtn' then Result := 'Create account and get a key…'
    else if Key = 'lang' then Result := 'Language:'
    else if Key = 'needname' then Result := 'Type your name to continue.'
    else if Key = 'badname' then Result := 'The name needs at least one letter or digit.'
    else if Key = 'askey' then Result := 'In Mirror: %s'
    else if Key = 'needkey' then Result := 'Paste your OpenRouter key to continue. It starts with sk-or-.'
    else if Key = 'configuring' then Result := 'Getting your Mirror ready…'
    else if Key = 'installing' then Result := 'Installing Node.js, Git and Pi. A few minutes.'
    else if Key = 'installed' then Result := 'All set.'
    else if Key = 'failed' then Result := 'Mirror Mind installation did not finish.'
    else if Key = 'cfgfail' then Result := 'Setup stopped halfway.' + #13#10 + 'The reason is shown above; the full log is at:'
    else if Key = 'cfghint' then Result := 'Most of the time it is the key (copied incomplete) or an OpenRouter account with no credit. Check and try again.'
    else if Key = 'instfail' then Result := 'Installation stopped halfway.' + #13#10 + 'The full log is at:'
    else if Key = 'insthint' then Result := 'Check your internet connection and run the installer again. It picks up where it left off.'
    else if Key = 'finished' then Result := 'Mirror opens in a text window. Talk to it as you would to a person: it already knows your name and learns from every conversation. To see what it can do, type /mm-help.';
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

{ What the person types becomes a key: mirror-mind 0.33.4 (CR141) takes a user
  name only as lowercase letters, digits and single hyphens -- it goes into a
  path and into MIRROR_USER for shell commands. "João Silva" -> "joao-silva".
  The page shows the key under the field, so nobody is surprised later. }
function UserKey(const S: String): String;
var
  i: Integer;
  c: Char;
  r: String;
begin
  r := '';
  for i := 1 to Length(S) do
  begin
    c := S[i];
    if (c >= 'A') and (c <= 'Z') then c := Chr(Ord(c) + 32);
    if Pos(c, 'áàâãäåÁÀÂÃÄÅ') > 0 then c := 'a'
    else if Pos(c, 'çÇ') > 0 then c := 'c'
    else if Pos(c, 'éèêëÉÈÊË') > 0 then c := 'e'
    else if Pos(c, 'íìîïÍÌÎÏ') > 0 then c := 'i'
    else if Pos(c, 'ñÑ') > 0 then c := 'n'
    else if Pos(c, 'óòôõöÓÒÔÕÖ') > 0 then c := 'o'
    else if Pos(c, 'úùûüÚÙÛÜ') > 0 then c := 'u'
    else if Pos(c, 'ýÿÝ') > 0 then c := 'y'
    else if Pos(c, ' _.-') > 0 then c := '-';
    if ((c >= 'a') and (c <= 'z')) or ((c >= '0') and (c <= '9')) then r := r + c
    else if (c = '-') and (Length(r) > 0) and (r[Length(r)] <> '-') then r := r + '-';
  end;
  while (Length(r) > 0) and (r[Length(r)] = '-') do Delete(r, Length(r), 1);
  if Length(r) > 80 then SetLength(r, 80);
  Result := r;
end;

procedure UpdateNameHint;
var
  k: String;
begin
  k := UserKey(NameEdit.Text);
  if k = '' then NameHint.Caption := ''
  else NameHint.Caption := Format(L('askey'), [k]);
end;

{ An event handler cannot be called directly with nil in Inno's PascalScript
  ("Could not call proc" at runtime); the work lives in UpdateNameHint. }
procedure NameEditChange(Sender: TObject);
begin
  UpdateNameHint;
end;

procedure InitializeWizard;
var
  SW, SH: Integer;
  KeyFromFile: AnsiString;
begin
  BootstrapOk := False;
  ConfigOk := False;
  if Lowercase(ActiveLanguage()) = 'pt' then CurLang := 'pt' else CurLang := 'en';

  WizardForm.WelcomeLabel1.Caption := L('welcome1');
  WizardForm.WelcomeLabel2.Caption := L('welcome2');

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
  { /KEYFILE=<path>: the key read from a file, never from the command line --
    Inno writes the command line into its log. For the demo and the tests. }
  if LoadStringFromFile(ExpandConstant('{param:KEYFILE|}'), KeyFromFile) then
    KeyEdit.Text := Trim(KeyFromFile);

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
  NameEdit.Top := KeyLabel.Top - ScaleY(46);
  NameHint := TNewStaticText.Create(WizardForm);
  NameHint.Parent := IdPage.Surface;
  NameHint.AutoSize := True;
  NameHint.Left := 0;
  NameHint.Top := NameEdit.Top + NameEdit.Height + ScaleY(2);
  NameHint.Font.Color := clGrayText;
  NameEdit.OnChange := @NameEditChange;
  { /NAME= and /KEYFILE= prefill the page: the demo recording and the automated
    tests drive the wizard with them. A user never passes them. The hint
    exists by now; filling the field before it did raised "Could not call proc". }
  NameEdit.Text := ExpandConstant('{param:NAME|}');
  if NameEdit.Text = '' then NameEdit.Text := GetUserNameString();
  UpdateNameHint;
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
  LogMemo.Height := WizardForm.ProgressGauge.Parent.ClientHeight - LogMemo.Top - ScaleY(4);
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
  { With the Ready page off, Welcome's Next is the install button; say so. }
  if CurPageID = wpWelcome then
    WizardForm.NextButton.Caption := SetupMessage(msgButtonInstall);
  if CurPageID = IdPage.ID then
  begin
    WizardForm.PageNameLabel.Caption := L('title');
    WizardForm.PageDescriptionLabel.Caption := L('subtitle');
    if KeyEdit.Text = '' then WizardForm.ActiveControl := KeyEdit;
  end;
  if CurPageID = wpFinished then
  begin
    Log(Format('finished page: ConfigOk=%d', [Integer(ConfigOk)]));
    WizardForm.BackButton.Visible := False;
    if (not ConfigOk) and (WizardForm.RunList.Items.Count > 0) then
    begin
      WizardForm.RunList.Checked[0] := False;
      WizardForm.RunList.Visible := False;
    end;
  end;
  if (CurPageID = wpFinished) and ConfigOk then
  begin
    WizardForm.FinishedLabel.Caption :=
      WizardForm.FinishedLabel.Caption + #13#10 + #13#10 + L('finished');
    { The label has a fixed height; without this the added text is clipped. }
    WizardForm.AdjustLabelHeight(WizardForm.FinishedLabel);
    WizardForm.RunList.Top := WizardForm.FinishedLabel.Top + WizardForm.FinishedLabel.Height + ScaleY(12);
  end;
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

{ A message box -- or, in a silent install, a log line. A MsgBox from [Code]
  ignores /SUPPRESSMSGBOXES and would wait forever on a runner with nobody
  to click OK (the CI build job found this). }
procedure Tell(const Msg: String);
begin
  if WizardSilent then Log('(silent) ' + Msg)
  else MsgBox(Msg, mbError, MB_OK);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = IdPage.ID) and (not BootstrapOk) then
    Result := True;
  { Silent and no key given (/KEYFILE): bootstrap only; configure is the
    person's, later. With /NAME and /KEYFILE the page runs unattended. }
  if (PageID = IdPage.ID) and WizardSilent and (Trim(KeyEdit.Text) = '') then
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
      Tell(L('needname'));
      Result := False;
      Exit;
    end;
    if UserKey(NameEdit.Text) = '' then
    begin
      Tell(L('badname'));
      Result := False;
      Exit;
    end;
    if Pos('sk-or-', Trim(KeyEdit.Text)) <> 1 then
    begin
      Tell(L('needkey'));
      Result := False;
      Exit;
    end;
    WizardForm.StatusLabel.Caption := L('configuring');
    BodyText.Visible := False;
    ConfigMemo.Visible := True;
    WizardForm.NextButton.Enabled := False;
    WizardForm.BackButton.Enabled := False;
    rc := RunPhase('configure', UserKey(NameEdit.Text), Trim(KeyEdit.Text), ConfigMemo);
    WizardForm.NextButton.Enabled := True;
    WizardForm.BackButton.Enabled := True;
    ConfigOk := (rc = 0);
    Log(Format('configure phase: rc=%d ConfigOk=%d', [rc, Integer(ConfigOk)]));
    if not ConfigOk then
    begin
      Tell(L('cfgfail') + #13#10 + DetailLogPath + #13#10 + #13#10 + L('cfghint'));
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
      Tell(L('instfail') + #13#10 + DetailLogPath + #13#10 + #13#10 + L('insthint'));
    end;
  end;
end;
