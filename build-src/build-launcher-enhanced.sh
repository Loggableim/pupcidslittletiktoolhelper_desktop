#!/bin/bash
# Build script for Enhanced Launcher
# Builds the new launcher with language selection and tabbed interface

echo "========================================"
echo "Building Enhanced LTTH Launcher"
echo "========================================"
echo

cd "$(dirname "$0")"

echo "[1/4] Checking Go installation..."
if ! command -v go &> /dev/null; then
    echo "ERROR: Go is not installed or not in PATH"
    echo "Please install Go from https://golang.org/dl/"
    exit 1
fi
echo "OK: Go is installed ($(go version))"

echo
echo "[2/4] Building launcher-enhanced (native)..."
go build -o launcher-enhanced launcher-gui-enhanced.go
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi
echo "OK: Build successful"

echo
echo "[3/4] Building launcher-enhanced.exe (Windows)..."
GOOS=windows GOARCH=amd64 go build -ldflags="-H windowsgui" -o launcher-enhanced.exe launcher-gui-enhanced.go
if [ $? -ne 0 ]; then
    echo "WARNING: Windows build failed"
else
    echo "OK: Windows build successful"
fi

echo
echo "[4/4] Copying to root directory..."
cp -f launcher-enhanced ../launcher
if [ $? -ne 0 ]; then
    echo "WARNING: Could not copy native build to root directory"
else
    echo "OK: Copied native build to root as launcher"
fi

if [ -f launcher-enhanced.exe ]; then
    cp -f launcher-enhanced.exe ../launcher.exe
    if [ $? -eq 0 ]; then
        echo "OK: Copied Windows build to root as launcher.exe"
    fi
fi

echo
echo "========================================"
echo "Build Complete!"
echo "========================================"
echo
echo "Output files:"
echo "  - build-src/launcher-enhanced (native)"
if [ -f launcher-enhanced.exe ]; then
    echo "  - build-src/launcher-enhanced.exe (Windows)"
    echo "  - launcher.exe (root directory)"
fi
echo "  - launcher (root directory)"
echo
echo "You can now run ./launcher (or launcher.exe on Windows) to start the tool."
echo
