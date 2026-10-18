#!/bin/bash
set -e

echo "========================================================"
echo "  VHS Studio Pro - Native Build Pipeline (macOS/Linux)"
echo "========================================================"

echo "[1/3] Building React Interface (UI)..."
cd ui
npm ci
npm run build
cd ..

echo "[2/3] Verifying Native Panasonic C Tools..."
if ! node scripts/build_panasonic_tools.mts --verify; then
    echo "[*] Compiling Panasonic C Tools from source..."
    node scripts/build_panasonic_tools.mts
fi

echo "[3/3] Compiling Native Rust Release Binary..."
cargo build --release

mkdir -p dist
cp -f target/release/vhs-studio dist/VHS_Studio_Pro

echo "========================================================"
echo "[OK] Build completed! Binary is located at:"
echo "     dist/VHS_Studio_Pro"
echo "========================================================"
