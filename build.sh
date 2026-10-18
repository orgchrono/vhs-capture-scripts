#!/bin/bash
set -e

echo "========================================================"
echo "  VHS Studio Pro - Build Pipeline (macOS/Linux)"
echo "========================================================"

if [ "$1" = "--native" ]; then
    echo "[*] Building Native Rust Desktop Binary (Release)..."
    cargo build --release --manifest-path src-tauri/Cargo.toml
    echo "[OK] Native build completed! Binary located in src-tauri/target/release"
    exit 0
fi

echo "[1/3] Building React Interface (UI)..."
cd ui
npm ci
npm run build
cd ..

echo "[2/4] Compiling Native Panasonic C Tools..."
python3 scripts/build_panasonic_tools.py

echo "[3/4] Installing Build and Project Dependencies..."
python3 -m pip install --upgrade pip pyinstaller
python3 -m pip install -e .[ai,cloud]

echo "[4/4] Packaging Native Executable..."
pyinstaller --noconfirm --clean --noupx \
  --name "VHS_Studio_Pro" \
  --windowed \
  --add-data "ui/dist:ui/dist" \
  --add-data "vhs_advanced_config.toml:." \
  --add-data "assets:assets" \
  --add-data "tools/panasonic_rec:tools/panasonic_rec" \
  --icon "assets/vhs_icon.png" \
  src/vhs_studio/cli/desktop.py

echo "========================================================"
echo "[OK] Build completed! Binary is located in the 'dist' directory."
echo "========================================================"
