#!/bin/bash
set -e

echo "========================================================"
echo "  VHS Studio Pro - Build Pipeline (Mac/Linux)"
echo "========================================================"

echo "[1/3] Compilando a Interface React (UI)..."
cd ui
npm ci
npm run build
cd ..

echo "[2/3] Instalando dependencias de Build e do Projeto..."
python3 -m pip install --upgrade pip pyinstaller
python3 -m pip install -e .[ai,cloud]

echo "[3/3] Empacotando Executavel Nativo..."
pyinstaller --noconfirm --clean \
  --name "VHS_Studio_Pro" \
  --windowed \
  --add-data "ui/dist:ui/dist" \
  --add-data "vhs_advanced_config.toml:." \
  src/vhs_studio/cli/desktop.py

echo "========================================================"
echo "[OK] Build concluido! O binario esta na pasta 'dist'."
echo "========================================================"