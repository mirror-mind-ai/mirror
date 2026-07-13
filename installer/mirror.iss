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
; Installer's own version (a bootstrapper, decoupled from the Mirror product
; version). Bump installer/VERSION when the installer changes; build.ps1 passes
; it as AppVersion. This fallback is only used for a bare 'iscc mirror.iss'.
#ifndef AppVersion
  #define AppVersion "0.30.0"
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
; Wizard banner illustration, extracted to {tmp} and loaded by [Code].
Source: "assets\wizard-banner.bmp"; Flags: dontcopy

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
  IdPage: TWizardPage;         { final identity page (custom) }
  BannerImage: TBitmapImage;
  LangLabel, BodyText, NameLabel, KeyLabel: TNewStaticText;
  LangCombo: TNewComboBox;
  NameEdit: TNewEdit;
  KeyEdit: TPasswordEdit;
  LogMemo: TNewMemo;           { bootstrap progress, on the Installing page }
  ConfigMemo: TNewMemo;        { configure progress, on the identity page }
  BootstrapOk: Boolean;
  CurLang: String;             { 'en' or 'pt' }
  AppBinDir, AppCloneDir, AppLogsDir, DetailLogPath: String;

function L(const Key: String): String;
begin
  Result := '';
  if CurLang = 'pt' then
  begin
    if Key = 'title' then Result := 'Configure seu Mirror'
    else if Key = 'subtitle' then Result := 'Duas ultimas coisas para o Mirror funcionar'
    else if Key = 'body' then Result :=
      'O Mirror foi instalado. Faltam duas coisas antes de comecar:' + #13#10 + #13#10 +
      '1) Seu nome - uma identidade e memoria privadas, guardadas somente NESTE computador (num arquivo .env local; nada e enviado para a internet).' + #13#10 + #13#10 +
      '2) Uma chave da OpenRouter - alimenta a MEMORIA do Mirror (embeddings, extracao, multi-modelo), nao o modelo de chat em si. Precisa de uma conta OpenRouter com pelo menos US$5 de credito: https://openrouter.ai/keys'
    else if Key = 'name' then Result := 'Seu nome (MIRROR_USER):'
    else if Key = 'key' then Result := 'Chave de API da OpenRouter:'
    else if Key = 'lang' then Result := 'Idioma:'
    else if Key = 'needname' then Result := 'Por favor, informe seu nome (MIRROR_USER).'
    else if Key = 'needkey' then Result := 'Por favor, informe sua chave de API da OpenRouter.'
    else if Key = 'configuring' then Result := 'Configurando a identidade do seu Mirror...'
    else if Key = 'installing' then Result := 'Instalando pre-requisitos e baixando o Mirror. Isso pode levar alguns minutos...'
    else if Key = 'installed' then Result := 'Pre-requisitos instalados e Mirror baixado.'
    else if Key = 'failed' then Result := 'A instalacao do Mirror Mind nao foi concluida.'
    else if Key = 'cfgfail' then Result := 'A configuracao nao foi concluida com sucesso.' + #13#10 + 'Os detalhes aparecem acima e um log completo esta em:'
    else if Key = 'cfghint' then Result := 'Verifique sua chave/creditos da OpenRouter e tente novamente.'
    else if Key = 'instfail' then Result := 'A instalacao nao foi concluida com sucesso.' + #13#10 + 'Um log completo esta em:'
    else if Key = 'insthint' then Result := 'Voce pode executar o instalador novamente para tentar de novo.'
    else if Key = 'loginnote' then Result := 'Mais uma coisa: o Mirror roda a conversa por uma assinatura de IA (Codex Plus recomendado). No primeiro acesso, digite  /login  dentro do Mirror para conectar. A chave OpenRouter cuida da memoria, nao do modelo de chat.';
  end
  else
  begin
    if Key = 'title' then Result := 'Set up your Mirror'
    else if Key = 'subtitle' then Result := 'Two last things Mirror needs to run'
    else if Key = 'body' then Result :=
      'Mirror is installed. Two last things before you start:' + #13#10 + #13#10 +
      '1) Your name - a private identity and memory kept only on THIS computer (in a local .env file; nothing is uploaded).' + #13#10 + #13#10 +
      '2) An OpenRouter API key - powers Mirror MEMORY (embeddings, extraction, multi-model), not the chat model itself. Needs an OpenRouter account with at least US$5 in credits: https://openrouter.ai/keys'
    else if Key = 'name' then Result := 'Your name (MIRROR_USER):'
    else if Key = 'key' then Result := 'OpenRouter API key:'
    else if Key = 'lang' then Result := 'Language:'
    else if Key = 'needname' then Result := 'Please enter your name (MIRROR_USER).'
    else if Key = 'needkey' then Result := 'Please enter your OpenRouter API key.'
    else if Key = 'configuring' then Result := 'Configuring your Mirror identity...'
    else if Key = 'installing' then Result := 'Installing prerequisites and downloading Mirror. This can take a few minutes...'
    else if Key = 'installed' then Result := 'Prerequisites installed and Mirror downloaded.'
    else if Key = 'failed' then Result := 'Mirror Mind installation did not finish.'
    else if Key = 'cfgfail' then Result := 'Configuration did not finish successfully.' + #13#10 + 'The details are shown above, and a full log is at:'
    else if Key = 'cfghint' then Result := 'Check your OpenRouter key/credits and try again.'
    else if Key = 'instfail' then Result := 'The installation did not finish successfully.' + #13#10 + 'A full log is at:'
    else if Key = 'insthint' then Result := 'You can re-run the installer to try again.'
    else if Key = 'loginnote' then Result := 'One more thing: Mirror runs the conversation through an AI subscription (Codex Plus recommended). On first launch, type  /login  inside Mirror to connect it. Your OpenRouter key powers memory, not the chat model.';
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
  LangLabel.Caption := L('lang');
end;

procedure LangComboChange(Sender: TObject);
begin
  if LangCombo.ItemIndex = 1 then CurLang := 'pt' else CurLang := 'en';
  ApplyLang();
end;

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
var
  SW, SH: Integer;
begin
  BootstrapOk := False;
  if Lowercase(ActiveLanguage()) = 'pt' then CurLang := 'pt' else CurLang := 'en';

  { Identity page created AFTER the Installing page, so it appears at the END,
    once prerequisites and the Mirror download have already succeeded. }
  IdPage := CreateCustomPage(wpInstalling, L('title'), L('subtitle'));
  SW := IdPage.SurfaceWidth;
  SH := IdPage.SurfaceHeight;

  { Landscape Mirror illustration as a centered banner at the top. }
  ExtractTemporaryFile('wizard-banner.bmp');
  BannerImage := TBitmapImage.Create(WizardForm);
  BannerImage.Parent := IdPage.Surface;
  BannerImage.Bitmap.LoadFromFile(ExpandConstant('{tmp}\wizard-banner.bmp'));
  BannerImage.Stretch := True;
  BannerImage.Width := ScaleX(246);
  BannerImage.Height := ScaleY(82);
  BannerImage.Left := (SW - BannerImage.Width) div 2;
  BannerImage.Top := 0;

  { Visible language selector (switches this page's text live). }
  LangCombo := TNewComboBox.Create(WizardForm);
  LangCombo.Parent := IdPage.Surface;
  LangCombo.Style := csDropDownList;
  LangCombo.Width := ScaleX(160);
  LangCombo.Left := SW - LangCombo.Width;
  LangCombo.Top := BannerImage.Top + BannerImage.Height + ScaleY(6);
  LangCombo.Items.Add('English');
  LangCombo.Items.Add('Portugues (Brasil)');
  if CurLang = 'pt' then LangCombo.ItemIndex := 1 else LangCombo.ItemIndex := 0;
  LangCombo.OnChange := @LangComboChange;

  LangLabel := TNewStaticText.Create(WizardForm);
  LangLabel.Parent := IdPage.Surface;
  LangLabel.AutoSize := True;
  LangLabel.Top := LangCombo.Top + ScaleY(3);
  LangLabel.Left := LangCombo.Left - ScaleX(72);

  { Fields anchored to the bottom; the body fills the middle (overflow-proof). }
  KeyEdit := TPasswordEdit.Create(WizardForm);
  KeyEdit.Parent := IdPage.Surface;
  KeyEdit.Left := 0;
  KeyEdit.Width := SW;
  KeyEdit.Top := SH - ScaleY(23);

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
  BodyText.Top := LangCombo.Top + LangCombo.Height + ScaleY(10);
  BodyText.Height := NameLabel.Top - BodyText.Top - ScaleY(6);

  { Configure progress overlays the body area (shown during the configure phase). }
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

  ApplyLang();
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = IdPage.ID then
  begin
    WizardForm.PageNameLabel.Caption := L('title');
    WizardForm.PageDescriptionLabel.Caption := L('subtitle');
  end;
  { On the Finished page, add the subscription / first-run /login guidance. }
  if (CurPageID = wpFinished) and BootstrapOk then
    WizardForm.FinishedLabel.Caption :=
      WizardForm.FinishedLabel.Caption + #13#10 + #13#10 + L('loginnote');
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
    if Trim(KeyEdit.Text) = '' then
    begin
      MsgBox(L('needkey'), mbError, MB_OK);
      Result := False;
      Exit;
    end;
    WizardForm.StatusLabel.Caption := L('configuring');
    BodyText.Visible := False;
    ConfigMemo.Visible := True;
    rc := RunPhase('configure', Trim(NameEdit.Text), Trim(KeyEdit.Text), ConfigMemo);
    if rc <> 0 then
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
