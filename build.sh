#!/bin/bash
set -e

echo "========================================================"
echo "  VHS Studio Pro - Build Pipeline (macOS/Linux)"
echo "========================================================"

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
