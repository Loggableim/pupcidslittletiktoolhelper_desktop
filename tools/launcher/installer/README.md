# LTTH NSIS Installer - Build Instructions

This directory contains everything needed to build a professional Windows installer for PupCid's Little TikTool Helper (LTTH).

## 📋 Overview

The NSIS installer creates a complete setup package that installs:
- LTTH Backend (`app/` directory with all modules and plugins)
- Go Launcher (`launcher.exe`)
- Optional: `ltthgit.exe` (cloud launcher)
- Optional: Portable Node.js runtime
- Desktop and Start Menu shortcuts
- Professional uninstaller with complete cleanup

**Features:**
- ✅ Modern UI with custom branding
- ✅ Splash screen with banner (using Banner plugin)
- ✅ Custom Start Menu folder selection (using StartMenu.dll)
- ✅ VPatch integration prepared for future updates
- ✅ **Code signing support with Certum cloud signing** (NEW!)
- ✅ Professional installer/uninstaller graphics
- ✅ Complete registry cleanup
- ✅ Admin rights handling
- ✅ Existing installation detection

## 🎯 Quick Start

### Prerequisites

1. **Install NSIS (Nullsoft Scriptable Install System)**
   - Download from: https://nsis.sourceforge.io/Download
   - Version: 3.x or higher (recommended: 3.09 or later)
   - Use default installation settings

2. **Optional: Install NSIS Plugins** (for advanced features)
   - **AdvSplash Plugin** (for advanced splash screen with fade effects)
     - Download from: https://nsis.sourceforge.io/AdvSplash_plug-in
     - Extract `AdvSplash.dll` to `C:\Program Files (x86)\NSIS\Plugins\x86-unicode\`
   - **Note:** The installer works without AdvSplash using the built-in Banner plugin

3. **Download Node.js Portable** (optional but recommended)
   - Download: https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
   - Or latest LTS: https://nodejs.org/dist/latest-v18.x/
   - Extract to: `build-src/assets/node/`
   - Verify: `build-src/assets/node/node.exe` should exist

4. **Optional: Setup Code Signing** (for trusted installers)
   - Install Windows SDK for signtool.exe
   - Install Certum SimplySign certificate in Windows Certificate Store
   - See [SIGNING.md](SIGNING.md) for complete guide

## 📁 Directory Structure

```
build-src/
├── installer/
│   ├── ltth-installer.nsi          ← Main NSIS script (drag this into MakeNSISW)
│   ├── build-installer.bat         ← Automated build script with signing support
│   ├── sign-file.bat               ← Code signing helper (called by NSIS)
│   ├── SIGNING.md                  ← Code signing documentation
│   ├── license.txt                 ← License text (auto-generated from LICENSE)
│   ├── installer-header.bmp        ← Header image (150x57, auto-generated)
│   ├── installer-sidebar.bmp       ← Sidebar image (164x314, auto-generated)
│   ├── splash-screen.bmp           ← Splash screen (500x300, auto-generated)
│   ├── banner.bmp                  ← Banner image (500x100, auto-generated)
│   └── README.md                   ← This file
├── assets/
│   ├── node/                       ← Node.js portable runtime (DOWNLOAD REQUIRED)
│   │   ├── node.exe                ← Node.js executable
│   │   ├── npm                     ← NPM package manager
│   │   └── node_modules/           ← Node.js core modules
│   └── splash.html                 ← Existing splash (for ltthgit.exe)
├── launcher.exe                    ← Local launcher (existing)
├── ltthgit.exe                     ← Cloud launcher (existing)
└── icon.ico                        ← Application icon (existing)
```

## 🚀 Building the Installer

### Method 1: GUI (Recommended for First Build)

1. **Prepare Node.js** (if not already done):
   ```bash
   # Download Node.js portable from https://nodejs.org/dist/v18.19.1/
   # Extract to build-src/assets/node/
   ```

2. **Verify all files are in place**:
   - ✅ `build-src/launcher.exe` exists
   - ✅ `build-src/icon.ico` exists
   - ✅ `app/` directory exists with all files
   - ✅ `build-src/installer/ltth-installer.nsi` exists
   - ✅ `build-src/assets/node/node.exe` exists (optional)

3. **Build the installer**:
   - Open **MakeNSISW** (NSIS compiler GUI)
   - Drag and drop `ltth-installer.nsi` into the MakeNSISW window
   - OR: Right-click `ltth-installer.nsi` → "Compile NSIS Script"
   - Wait for compilation (30-60 seconds)

4. **Result**:
   - Output: `build-src/installer/LTTH-Setup-1.2.0.exe`
   - Size: ~50-200 MB (depending on Node.js inclusion)

### Method 2: Command Line

```bash
# Navigate to installer directory
cd build-src/installer

# Compile using NSIS
"C:\Program Files (x86)\NSIS\makensis.exe" ltth-installer.nsi

# Output: LTTH-Setup-1.2.0.exe
```

### Method 3: Batch Script (Automated)

Create `build-installer.bat` in `build-src/installer/`:

```batch
@echo off
echo ============================================
echo Building LTTH Installer...
echo ============================================

REM Check if NSIS is installed
if not exist "C:\Program Files (x86)\NSIS\makensis.exe" (
    echo ERROR: NSIS not found!
    echo Please install NSIS from https://nsis.sourceforge.io/Download
    pause
    exit /b 1
)

REM Compile installer
"C:\Program Files (x86)\NSIS\makensis.exe" ltth-installer.nsi

if %ERRORLEVEL% == 0 (
    echo.
    echo ============================================
    echo SUCCESS! Installer created:
    echo LTTH-Setup-1.2.0.exe
    echo ============================================
) else (
    echo.
    echo ============================================
    echo ERROR! Build failed. Check error messages above.
    echo ============================================
)

pause
```

Then simply double-click `build-installer.bat` to build.

## 🔐 Code Signing (Optional)

The installer supports automatic code signing using Windows signtool with Certum cloud signing certificates.

### Quick Start

```batch
# Enable code signing
set SIGN_ENABLED=1

# Build installer (will sign automatically)
build-installer.bat
```

### Features

- ✅ Signs both installer and uninstaller executables
- ✅ Uses Windows Certificate Store (Certum SimplySign compatible)
- ✅ Automatic signtool detection from Windows SDK
- ✅ Timestamping for long-term validity
- ✅ Signature verification after signing
- ✅ Optional - disabled by default (no errors if not configured)

### Documentation

For complete code signing setup, configuration, and troubleshooting:

📖 **See [SIGNING.md](SIGNING.md)** - Complete code signing guide

**Quick reference:**
- Set `SIGN_ENABLED=1` to enable signing
- Set `SIGNTOOL_PATH` for custom signtool location (optional)
- Set `TIMESTAMP_URL` for custom timestamp server (optional)

**Example with custom settings:**

```batch
set SIGN_ENABLED=1
set SIGNTOOL_PATH=D:\Tools\signtool.exe
set TIMESTAMP_URL=https://timestamp.sectigo.com
build-installer.bat
```

## 📦 What Gets Installed

When a user runs the installer, they can choose to install:

### Required:
- **LTTH Core Application** (read-only, always installed)
  - All files from `app/` directory
  - `launcher.exe` (main launcher)
  - `icon.ico` (application icon)
  - `ltthgit.exe` (if available)
  - Uninstaller

### Optional:
- **Node.js Portable Runtime** (recommended, selected by default)
  - Portable Node.js v18.x
  - No system-wide changes
  - Self-contained in installation directory

- **Desktop Shortcut** (selected by default)
  - Creates shortcut on desktop

- **Start Menu Shortcuts** (selected by default)
  - Creates program folder in Start Menu
  - Shortcuts to launcher and uninstaller
  - Optional README link

- **Quick Launch Shortcut** (not selected by default)
  - Creates taskbar quick launch shortcut

### Installation Process:

1. **Splash Screen**: Shows LTTH branding with banner
2. **Welcome Page**: Introduction and product info
3. **License Agreement**: CC-BY-NC-4.0 license (must accept)
4. **Component Selection**: Choose optional components
5. **Directory Selection**: Choose installation path (default: `C:\Program Files\LTTH`)
6. **Start Menu Folder**: Choose Start Menu folder name (uses StartMenu.dll)
7. **Installation**: Progress with banner updates
8. **Finish**: Option to launch LTTH immediately

## 🎨 Customizing the Installer

### Change Version Number

Edit `ltth-installer.nsi` line 18:
```nsis
!define PRODUCT_VERSION "1.2.0"  ; Change this
```

### Customize Images

Replace the auto-generated BMP files with your own:

- **installer-header.bmp**: 150x57 pixels, 24-bit BMP
- **installer-sidebar.bmp**: 164x314 pixels, 24-bit BMP
- **splash-screen.bmp**: 500x300 pixels, 24-bit BMP (for AdvSplash)
- **banner.bmp**: 500x100 pixels, 24-bit BMP (for Banner plugin)

**Note:** Use BMP format (not PNG/JPG) for maximum compatibility.

### Change Branding Text

Edit these defines in `ltth-installer.nsi`:
```nsis
!define PRODUCT_NAME "PupCid's Little TikTool Helper"
!define PRODUCT_NAME_SHORT "LTTH"
!define PRODUCT_PUBLISHER "PupCid / Loggableim"
!define PRODUCT_WEB_SITE "https://ltth.app"
```

### Add/Remove Components

To add a new optional component, add a section like this:

```nsis
Section "My New Feature" SEC_MYFEATURE
  SetOutPath "$INSTDIR\myfeature"
  File /r "path\to\files\*.*"
SectionEnd
```

Then add description:
```nsis
!insertmacro MUI_DESCRIPTION_TEXT ${SEC_MYFEATURE} "Description of my feature"
```

## 🔄 VPatch Integration (Future Updates)

The installer is prepared for VPatch integration for automatic updates:

### Setup Steps:

1. **Install VPatch Plugin**:
   - Download from: https://nsis.sourceforge.io/VPatch_plug-in
   - Copy `VPatch.dll` to NSIS plugins folder
   - Copy `GenPat.exe` to your tools directory

2. **Generate Patches**:
   ```bash
   GenPat.exe old-version.exe new-version.exe patch.dat
   ```

3. **Create Update Server**:
   - Host patch files on web server
   - Create version.json with latest version info
   - Implement version checking in launcher.exe

4. **Apply Updates**:
   - Launcher checks for updates
   - Downloads patch file
   - Applies patch using VPatch
   - Restarts application

**Documentation**: See `NSIS\Docs\VPatch\Readme.html` for full details.

## 🧪 Testing the Installer

### Before Building:

1. ✅ Verify all source files exist
2. ✅ Test `launcher.exe` manually
3. ✅ Check `app/` contains all required files
4. ✅ Ensure Node.js portable is complete (if including)

### After Building:

1. **Test Installation**:
   - Run `LTTH-Setup-1.2.0.exe` as Administrator
   - Select all components
   - Complete installation
   - Verify shortcuts work
   - Launch application

2. **Test Uninstallation**:
   - Run uninstaller from Start Menu or Control Panel
   - Verify all files removed
   - Check registry cleaned up
   - Confirm no leftover files

3. **Test Upgrade**:
   - Install version 1.0
   - Run installer for version 1.2
   - Verify upgrade works correctly

## 📊 Installer Size

Approximate sizes:

- **Core Application**: ~10-20 MB (app directory + launchers)
- **Node.js Portable**: ~120-150 MB
- **Installer Overhead**: ~5-10 MB (compression, uninstaller)

**Total Installer Size**: ~150-200 MB (with Node.js)  
**Without Node.js**: ~20-30 MB

**Installation Time**: 30-60 seconds (depending on disk speed)

## 🐛 Troubleshooting

### Build Errors

**"Can't open script file"**
- Solution: Make sure you're in the `build-src/installer` directory
- Or provide full path to `ltth-installer.nsi`

**"File not found: ../launcher.exe"**
- Solution: Verify `launcher.exe` exists in `build-src/`
- Build launcher first: `cd build-src && go build -o launcher.exe launcher-gui.go`

**"File not found: ../../app"**
- Solution: Verify `app/` directory exists in repository root
- Ensure all app files are present

**"File not found: ../assets/node"**
- Solution: This is optional. Either:
  - Download and extract Node.js portable to `build-src/assets/node/`
  - Or comment out the Node.js section in the script

### Runtime Errors

**"Failed to extract files"**
- Cause: Insufficient disk space or permissions
- Solution: Run as Administrator, free up disk space

**"Installation directory not empty"**
- Cause: Previous installation not cleaned up
- Solution: Uninstall previous version or choose different directory

**"Application won't launch after install"**
- Cause: Missing Node.js or dependencies
- Solution: Install Node.js section or ensure Node.js is on system PATH

## 📝 Advanced Customization

### Enable AdvSplash (Advanced Splash Screen)

1. Install AdvSplash plugin
2. Uncomment these lines in `ltth-installer.nsi` (around line 123):
   ```nsis
   advsplash::show 2000 500 500 0x1a1a2e "splash-screen.bmp"
   Pop $0
   ```
3. Comment out the Banner::show lines

### Add Custom Registry Keys

Add to the installation section:
```nsis
WriteRegStr HKCU "Software\LTTH" "InstallPath" "$INSTDIR"
WriteRegStr HKCU "Software\LTTH" "Version" "${PRODUCT_VERSION}"
```

### Run Post-Install Commands

Add before `SectionEnd` in SEC_CORE:
```nsis
; Run npm install
nsExec::ExecToLog '"$INSTDIR\node\node.exe" "$INSTDIR\node\npm" install --prefix "$INSTDIR\app"'
Pop $0
```

## 🔐 Security Notes

- Installer requires **Administrator privileges** (RequestExecutionLevel admin)
- Digital signing recommended for distribution (use SignTool.exe)
- Registry keys stored in HKLM (system-wide)
- Uninstaller removes all traces

### Code Signing (Recommended):

```bash
signtool.exe sign /f certificate.pfx /p password /t http://timestamp.digicert.com LTTH-Setup-1.2.0.exe
```

## 📚 Additional Resources

- **NSIS Documentation**: https://nsis.sourceforge.io/Docs/
- **NSIS Modern UI**: https://nsis.sourceforge.io/Docs/Modern%20UI/Readme.html
- **NSIS Plugins**: https://nsis.sourceforge.io/Category:Plugins
- **VPatch Documentation**: NSIS\Docs\VPatch\Readme.html
- **StartMenu.dll**: Included with NSIS Modern UI

## 🎯 Final Checklist

Before distributing the installer:

- [ ] Test on clean Windows 10/11 system
- [ ] Test with and without admin rights
- [ ] Verify all components install correctly
- [ ] Test uninstallation completely removes everything
- [ ] Test upgrade from previous version
- [ ] Verify shortcuts work correctly
- [ ] Check file associations (if any)
- [ ] Test on different Windows versions
- [ ] Consider code signing for trusted publisher
- [ ] Create installation documentation for users
- [ ] Test with antivirus software enabled

## 📧 Support

For issues or questions:
- GitHub: https://github.com/Loggableim/pupcidslittletiktoolhelper_desktop
- Email: pupcid@ltth.app
- Website: https://ltth.app

---

**License**: CC-BY-NC-4.0  
**Version**: 1.2.0  
**Last Updated**: 2025-12-07
