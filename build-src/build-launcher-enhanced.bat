@echo off
REM Build script for Enhanced Launcher
REM Builds the new launcher with language selection and tabbed interface

echo ========================================
echo Building Enhanced LTTH Launcher
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Checking Go installation...
go version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Go is not installed or not in PATH
    echo Please install Go from https://golang.org/dl/
    pause
    exit /b 1
)
echo OK: Go is installed

echo.
echo [2/3] Building launcher-gui-enhanced.exe...
go build -ldflags="-H windowsgui" -o launcher-enhanced.exe launcher-gui-enhanced.go
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo OK: Build successful

echo.
echo [3/3] Copying to root directory...
copy /Y launcher-enhanced.exe ..\launcher.exe
if errorlevel 1 (
    echo WARNING: Could not copy to root directory
) else (
    echo OK: Copied to root as launcher.exe
)

echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Output files:
echo   - build-src\launcher-enhanced.exe
echo   - launcher.exe (root directory)
echo.
echo You can now run launcher.exe to start the tool.
echo.
pause
