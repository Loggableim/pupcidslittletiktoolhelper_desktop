; ============================================================================
; PupCid's Little TikTool Helper (LTTH) - NSIS Installer Script
; ============================================================================
; Version: 1.2.0
; Description: Professional TikTok LIVE Streaming Tool Installer
; License: CC-BY-NC-4.0
; ============================================================================

; ============================================================================
; INCLUDES
; ============================================================================
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "Sections.nsh"

; ============================================================================
; INSTALLER CONFIGURATION
; ============================================================================

; Application Information
!define PRODUCT_NAME "PupCid's Little TikTool Helper"
!define PRODUCT_NAME_SHORT "LTTH"
!define PRODUCT_VERSION "1.2.0"
!define PRODUCT_PUBLISHER "PupCid / Loggableim"
!define PRODUCT_WEB_SITE "https://ltth.app"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\launcher.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME_SHORT}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; Paths (relative to build-src/installer directory)
!define BUILD_DIR ".."
!define APP_DIR "../../app"
!define ASSETS_DIR "../assets"

; Installer Properties
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "LTTH-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME_SHORT}"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${PRODUCT_NAME} ${PRODUCT_VERSION} © ${PRODUCT_PUBLISHER}"

; ============================================================================
; MODERN UI CONFIGURATION
; ============================================================================

; Modern UI Settings
!define MUI_ABORTWARNING
!define MUI_ICON "${BUILD_DIR}\icon.ico"
!define MUI_UNICON "${BUILD_DIR}\icon.ico"

; Header and Sidebar Images
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "installer-header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "installer-header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "installer-sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "installer-sidebar.bmp"

; Welcome Page Settings
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${PRODUCT_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ${PRODUCT_NAME} ${PRODUCT_VERSION}.$\r$\n$\r$\nProfessional TikTok LIVE streaming tool with overlays, alerts, TTS, automation, and an extensive plugin ecosystem.$\r$\n$\r$\nClick Next to continue."

; Finish Page Settings
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been successfully installed.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\launcher.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\app\README.md"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Show README"
!define MUI_FINISHPAGE_LINK "Visit ${PRODUCT_WEB_SITE}"
!define MUI_FINISHPAGE_LINK_LOCATION "${PRODUCT_WEB_SITE}"

; License Page Settings
!define MUI_LICENSEPAGE_CHECKBOX

; ============================================================================
; INSTALLER PAGES
; ============================================================================

; Page order
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY

; Start Menu Configuration Page (using StartMenu.dll)
Var StartMenuFolder
!define MUI_STARTMENUPAGE_REGISTRY_ROOT "HKLM"
!define MUI_STARTMENUPAGE_REGISTRY_KEY "${PRODUCT_UNINST_KEY}"
!define MUI_STARTMENUPAGE_REGISTRY_VALUENAME "Start Menu Folder"
!define MUI_STARTMENUPAGE_DEFAULTFOLDER "${PRODUCT_NAME_SHORT}"
!insertmacro MUI_PAGE_STARTMENU Application $StartMenuFolder

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; ============================================================================
; LANGUAGES
; ============================================================================
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "German"

; ============================================================================
; INSTALLER INITIALIZATION
; ============================================================================

; Splash Screen Function
Function .onInit
  ; Show splash screen with banner using AdvSplash plugin
  ; Note: Requires NSIS AdvSplash plugin to be installed
  ; The splash will display for 2000ms (2 seconds) with fade effects
  
  ; Check if AdvSplash plugin is available
  ; If not available, the installer will continue without splash
  ; To enable: Copy AdvSplash.dll to NSIS\Plugins directory
  
  ; Uncomment when AdvSplash plugin is installed:
  ; advsplash::show 2000 500 500 0x1a1a2e "splash-screen.bmp"
  ; Pop $0 ; Return value (not used)
  
  ; Alternative: Use Banner plugin (built-in NSIS)
  Banner::show /NOUNLOAD /set 76 "Installing ${PRODUCT_NAME}" "Please wait while setup initializes..."
  Sleep 1500
  Banner::destroy
  
  ; Check if already installed
  ReadRegStr $R0 ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString"
  StrCmp $R0 "" done
  
  MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
  "${PRODUCT_NAME} is already installed.$\n$\nClick OK to remove the previous version or Cancel to abort." \
  IDOK uninst
  Abort
  
uninst:
  ClearErrors
  ExecWait '$R0 _?=$INSTDIR'
  
done:
FunctionEnd

; ============================================================================
; INSTALLATION SECTIONS
; ============================================================================

; Core Application (Required)
Section "!LTTH Core Application" SEC_CORE
  SectionIn RO  ; Read-only (required)
  
  SetOutPath "$INSTDIR"
  SetOverwrite on
  
  ; Show progress banner
  Banner::show /NOUNLOAD "Installing Core Files" "Installing launcher and executables..."
  
  ; Install launcher executable
  File "${BUILD_DIR}\launcher.exe"
  File "${BUILD_DIR}\icon.ico"
  
  ; Install ltthgit.exe (optional cloud launcher)
  IfFileExists "${BUILD_DIR}\ltthgit.exe" 0 +2
    File "${BUILD_DIR}\ltthgit.exe"
  
  Banner::destroy
  
  ; Install app directory
  Banner::show /NOUNLOAD "Installing Application" "Copying application files..."
  SetOutPath "$INSTDIR\app"
  
  ; Copy root-level files first (exclude backup files and git files)
  File /x "*.md~" /x ".git*" "${APP_DIR}\*.*"
  
  ; Copy subdirectories individually, excluding runtime-generated directories:
  ; - logs: Contains Winston audit files (.*.json) that cause NSIS errors
  ; - node_modules: Runtime dependencies installed by npm
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\data"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\docs"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\locales"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\modules"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\plugins"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\public"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\routes"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\scripts"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\test"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\tts"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\user_configs"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\user_data"
  File /r /x "*.md~" /x ".git*" "${APP_DIR}\wiki"
  
  ; Create runtime directories that were excluded from packaging
  ; These directories are needed for the application to run properly
  CreateDirectory "$INSTDIR\app\logs"
  
  Banner::destroy
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Write registry keys
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\launcher.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  
  ; Calculate and write install size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

; Node.js Portable Runtime (Optional but Recommended)
Section "Node.js Portable Runtime" SEC_NODEJS
  Banner::show /NOUNLOAD "Installing Node.js" "Installing portable Node.js runtime..."
  
  SetOutPath "$INSTDIR\node"
  
  ; Check if Node.js portable exists
  IfFileExists "${ASSETS_DIR}\node\node.exe" 0 nodejs_missing
    File /r "${ASSETS_DIR}\node\*.*"
    Goto nodejs_done
    
nodejs_missing:
  Banner::destroy
  MessageBox MB_ICONINFORMATION|MB_OK "Node.js portable not found in build-src\assets\node\$\n$\nPlease download Node.js portable and place it in the assets folder before building.$\n$\nDownload from: https://nodejs.org/dist/latest-v18.x/$\n$\nInstallation will continue without Node.js."
  Goto nodejs_done
  
nodejs_done:
  Banner::destroy
SectionEnd

; Desktop Shortcut
Section "Desktop Shortcut" SEC_DESKTOP
  CreateShortCut "$DESKTOP\${PRODUCT_NAME_SHORT}.lnk" "$INSTDIR\launcher.exe" "" "$INSTDIR\icon.ico" 0
SectionEnd

; Start Menu Shortcuts
Section "Start Menu Shortcuts" SEC_STARTMENU
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
  
  CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
  CreateShortCut "$SMPROGRAMS\$StartMenuFolder\${PRODUCT_NAME_SHORT}.lnk" "$INSTDIR\launcher.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\$StartMenuFolder\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  
  ; Optional: Add README and other shortcuts
  IfFileExists "$INSTDIR\app\README.md" 0 +2
    CreateShortCut "$SMPROGRAMS\$StartMenuFolder\README.lnk" "$INSTDIR\app\README.md"
  
  !insertmacro MUI_STARTMENU_WRITE_END
SectionEnd

; Quick Launch Shortcut (Windows 7+)
Section /o "Quick Launch Shortcut" SEC_QUICKLAUNCH
  CreateShortCut "$QUICKLAUNCH\${PRODUCT_NAME_SHORT}.lnk" "$INSTDIR\launcher.exe" "" "$INSTDIR\icon.ico" 0
SectionEnd

; ============================================================================
; SECTION DESCRIPTIONS
; ============================================================================

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CORE} "Core application files (required)"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_NODEJS} "Portable Node.js runtime for running the application"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} "Creates a desktop shortcut"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_STARTMENU} "Creates Start Menu shortcuts"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_QUICKLAUNCH} "Creates a Quick Launch shortcut"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ============================================================================
; UNINSTALLER
; ============================================================================

Section "Uninstall"
  ; Show progress
  Banner::show /NOUNLOAD "Uninstalling ${PRODUCT_NAME}" "Removing files and shortcuts..."
  
  ; Remove files and directories
  Delete "$INSTDIR\launcher.exe"
  Delete "$INSTDIR\ltthgit.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  
  ; Remove app directory
  RMDir /r "$INSTDIR\app"
  
  ; Remove node directory
  RMDir /r "$INSTDIR\node"
  
  ; Remove shortcuts
  Delete "$DESKTOP\${PRODUCT_NAME_SHORT}.lnk"
  Delete "$QUICKLAUNCH\${PRODUCT_NAME_SHORT}.lnk"
  
  ; Remove Start Menu shortcuts
  !insertmacro MUI_STARTMENU_GETFOLDER Application $StartMenuFolder
  Delete "$SMPROGRAMS\$StartMenuFolder\${PRODUCT_NAME_SHORT}.lnk"
  Delete "$SMPROGRAMS\$StartMenuFolder\Uninstall.lnk"
  Delete "$SMPROGRAMS\$StartMenuFolder\README.lnk"
  RMDir "$SMPROGRAMS\$StartMenuFolder"
  
  ; Remove installation directory
  RMDir "$INSTDIR"
  
  ; Remove registry keys
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  
  Banner::destroy
  
  MessageBox MB_ICONINFORMATION|MB_OK "${PRODUCT_NAME} has been successfully uninstalled."
SectionEnd

; ============================================================================
; VPATCH UPDATER INTEGRATION
; ============================================================================
; VPatch Integration Notes:
; 
; To enable automatic updates using VPatch:
; 1. Install VPatch plugin for NSIS (copy VPatch.dll to NSIS\Plugins)
; 2. Generate patch files using GenPat.exe (included with VPatch)
; 3. Create update server to host patch files
; 4. Add update check logic to launcher or app
;
; Example VPatch usage:
; VPatch::vpatchfile "old-version.exe" "new-version.exe" "patch.dat"
; Pop $0 ; Return value
;
; For implementation:
; - Create separate update installer that applies patches
; - Implement version checking in launcher.exe
; - Download and apply patches when available
; - See NSIS\Docs\VPatch\Readme.html for full documentation
;
; This section is prepared for future implementation.
; The actual update mechanism should be implemented in the launcher application.

; ============================================================================
; HELPER FUNCTIONS
; ============================================================================

; Check for running instances
Function CheckRunning
  FindWindow $0 "" "${PRODUCT_NAME}"
  StrCmp $0 0 notrunning
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION \
    "${PRODUCT_NAME} is currently running.$\n$\nPlease close it and try again." \
    IDOK CheckRunning IDCANCEL abort
abort:
  Abort
notrunning:
FunctionEnd

; Post-installation tasks
Function .onInstSuccess
  MessageBox MB_ICONINFORMATION|MB_OK \
  "${PRODUCT_NAME} ${PRODUCT_VERSION} has been successfully installed!$\n$\nYou can now launch the application from the Start Menu or Desktop shortcut."
FunctionEnd

; Installation failed
Function .onInstFailed
  MessageBox MB_ICONEXCLAMATION|MB_OK \
  "Installation failed. Please check the installation log for details."
FunctionEnd

; Uninstaller initialization
Function un.onInit
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 \
  "Are you sure you want to completely remove ${PRODUCT_NAME} and all of its components?" \
  IDYES +2
  Abort
FunctionEnd

; Uninstaller success
Function un.onUninstSuccess
  HideWindow
FunctionEnd

; ============================================================================
; END OF INSTALLER SCRIPT
; ============================================================================
