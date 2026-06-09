; Mirror Mind Windows Installer - NSIS Script
; Packages install.ps1 + adapter/ + uninstall.ps1 into a single EXE

!include "MUI2.nsh"
!include "FileFunc.nsh"

; --- General ---
Name "Mirror Mind"
OutFile "..\dist\MirrorMindSetup.exe"
InstallDir "$LOCALAPPDATA\MirrorMind"
RequestExecutionLevel admin
Unicode True

; --- Version info ---
!define PRODUCT_NAME "Mirror Mind"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Mirror Mind Community"
!define PRODUCT_WEB_SITE "https://github.com/mirror-mind-ai/mirror"

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} Windows Installer"
VIAddVersionKey "LegalCopyright" "MIT License"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"

; --- Interface ---
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Mirror Mind"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install Mirror Mind and all required dependencies on your computer.$\r$\n$\r$\nMirror Mind is a local-first memory and identity framework for agentic AI runtimes.$\r$\n$\r$\nThe installer will set up:$\r$\n  - Git, Node.js, uv (Python manager)$\r$\n  - Pi coding agent$\r$\n  - Mirror Mind with Windows compatibility layer$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "Mirror Mind files have been extracted.$\r$\n$\r$\nClick Finish to run the setup script, which will install dependencies and configure your account."

; --- Pages ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; --- Language ---
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "PortugueseBR"

; --- Installer Sections ---
Section "Install" SecInstall
    SetOutPath "$INSTDIR"

    ; Copy install script
    File "..\install.ps1"
    File "..\uninstall.ps1"

    ; Copy adapter directory
    SetOutPath "$INSTDIR\adapter"
    File "..\adapter\win_compat.py"
    File "..\adapter\mirror-logger.win.ts"
    File "..\adapter\health_check.ps1"

    ; Create logs directory
    CreateDirectory "$INSTDIR\logs"

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Add to Add/Remove Programs
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "NoRepair" 1

    ; Launch install.ps1 in a new PowerShell window for interactive setup
    Exec 'powershell.exe -ExecutionPolicy Bypass -NoExit -File "$INSTDIR\install.ps1" -InstallDir "$INSTDIR"'

    ; Calculate installed size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind" \
        "EstimatedSize" $0

SectionEnd

; --- Uninstaller Section ---
Section "Uninstall"
    ; Run PowerShell uninstaller silently
    nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -File "$INSTDIR\uninstall.ps1" -InstallDir "$INSTDIR" -Confirm'

    ; Remove uninstaller itself
    Delete "$INSTDIR\Uninstall.exe"
    Delete "$INSTDIR\install.ps1"
    Delete "$INSTDIR\uninstall.ps1"
    RMDir /r "$INSTDIR\adapter"
    RMDir /r "$INSTDIR\logs"
    RMDir /r "$INSTDIR\repo"
    RMDir "$INSTDIR"

    ; Remove registry keys
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MirrorMind"

    ; Remove Start Menu shortcut
    Delete "$SMPROGRAMS\Mirror Mind.lnk"

SectionEnd
