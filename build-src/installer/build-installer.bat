@echo off
REM ============================================================================
REM LTTH Installer Build Script
REM ============================================================================
REM This script compiles the NSIS installer for LTTH
REM Usage: Simply double-click this file or run from command line
REM ============================================================================

echo.
echo ============================================
echo LTTH Installer Build Script
echo ============================================
echo.

REM Check if NSIS is installed
set NSIS_PATH=C:\Program Files (x86)\NSIS\makensis.exe

if not exist "%NSIS_PATH%" (
    echo [ERROR] NSIS not found at: %NSIS_PATH%
    echo.
    echo Please install NSIS from:
    echo https://nsis.sourceforge.io/Download
    echo.
    echo Alternative: Drag ltth-installer.nsi into MakeNSISW window
    echo.
    pause
    exit /b 1
)

echo [OK] NSIS found: %NSIS_PATH%
echo.

REM Check for required files
echo Checking required files...
echo.

if not exist "..\launcher.exe" (
    echo [WARNING] launcher.exe not found in build-src\
    echo Please build the launcher first
)

if not exist "..\..\app\server.js" (
    echo [ERROR] app directory not found!
    echo Please ensure you're running this from build-src\installer\
    pause
    exit /b 1
)

if not exist "..\icon.ico" (
    echo [WARNING] icon.ico not found in build-src\
)

if not exist "..\assets\node\node.exe" (
    echo [INFO] Node.js portable not found (optional)
    echo The installer will be built without Node.js
    echo Download from: https://nodejs.org/dist/latest-v18.x/
    echo Extract to: build-src\assets\node\
    echo.
)

echo [OK] Core files found
echo.

REM Compile the installer
echo ============================================
echo Compiling NSIS installer...
echo ============================================
echo.

"%NSIS_PATH%" ltth-installer.nsi

if %ERRORLEVEL% == 0 (
    echo.
    echo ============================================
    echo SUCCESS!
    echo ============================================
    echo.
    echo Installer created successfully!
    echo.
    echo Output: LTTH-Setup-1.2.0.exe
    echo Location: %CD%
    echo.
    echo You can now distribute this installer.
    echo.
    echo ============================================
) else (
    echo.
    echo ============================================
    echo BUILD FAILED
    echo ============================================
    echo.
    echo Please check the error messages above.
    echo.
    echo Common issues:
    echo - Missing files (launcher.exe, app directory, etc.)
    echo - Incorrect paths in ltth-installer.nsi
    echo - NSIS version too old (need 3.x+)
    echo.
    echo ============================================
)

echo.
pause
