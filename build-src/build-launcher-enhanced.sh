#!/bin/bash
# Build script for Enhanced Launcher
# Builds the new launcher with language selection and tabbed interface

echo "========================================"
echo "Building Enhanced LTTH Launcher"
echo "========================================"
echo

cd "$(dirname "$0")"

echo "[1/3] Checking Go installation..."
if ! command -v go &> /dev/null; then
    echo "ERROR: Go is not installed or not in PATH"
    echo "Please install Go from https://golang.org/dl/"
    exit 1
fi
echo "OK: Go is installed ($(go version))"

echo
echo "[2/3] Building launcher-enhanced..."
go build -o launcher-enhanced launcher-gui-enhanced.go
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed"
    exit 1
fi
echo "OK: Build successful"

echo
echo "[3/3] Copying to root directory..."
cp -f launcher-enhanced ../launcher
if [ $? -ne 0 ]; then
    echo "WARNING: Could not copy to root directory"
else
    echo "OK: Copied to root as launcher"
fi

echo
echo "========================================"
echo "Build Complete!"
echo "========================================"
echo
echo "Output files:"
echo "  - build-src/launcher-enhanced"
echo "  - launcher (root directory)"
echo
echo "You can now run ./launcher to start the tool."
echo
