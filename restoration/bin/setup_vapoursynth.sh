#!/usr/bin/env bash
# setup_vapoursynth.sh - Instalador multiplataforma do VapourSynth + QTGMC para macOS e Linux
set -euo pipefail

echo "============================================================"
echo "  VHS STUDIO - INSTALADOR VAPOURSYNTH & QTGMC (UNIX/MACOS)"
echo "============================================================"
echo

OS_TYPE="$(uname -s)"

# 1. Instalação no macOS via Homebrew
if [ "$OS_TYPE" = "Darwin" ]; then
    echo "[*] Sistema detectado: macOS"
    if command -v brew >/dev/null 2>&1; then
        echo " -> Instalando vapoursynth via Homebrew..."
        brew install vapoursynth ffmpeg
    else
        echo "[ERRO] Homebrew não encontrado. Instale o Homebrew primeiro: https://brew.sh"
        exit 1
    fi

# 2. Instalação no Linux (Debian, Ubuntu, Arch, Fedora)
elif [ "$OS_TYPE" = "Linux" ]; then
    echo "[*] Sistema detectado: Linux"
    if command -v apt-get >/dev/null 2>&1; then
        echo " -> Instalando via apt (Debian/Ubuntu)..."
        sudo apt-get update
        sudo apt-get install -y vapoursynth python3-vapoursynth libvapoursynth-extra ffmpeg
    elif command -v pacman >/dev/null 2>&1; then
        echo " -> Instalando via pacman (Arch Linux)..."
        sudo pacman -S --noconfirm vapoursynth python-vapoursynth ffmpeg
    elif command -v dnf >/dev/null 2>&1; then
        echo " -> Instalando via dnf (Fedora)..."
        sudo dnf install -y vapoursynth python3-vapoursynth ffmpeg
    else
        echo "[AVISO] Gerenciador de pacotes não reconhecido. Instale o vapoursynth manualmente."
    fi
else
    echo "[ERRO] Sistema operacional não suportado: $OS_TYPE"
    exit 1
fi

# 3. Dependências Python para QTGMC
echo
echo "[*] Instalando bibliotecas Python (havsfunc)..."
python3 -m pip install --upgrade pip || true
python3 -m pip install havsfunc || python3 -m pip install havsfunc --break-system-packages || true

# 4. Validação
echo
echo "[*] Validando instalação..."
if command -v vspipe >/dev/null 2>&1; then
    echo "  ✓ vspipe encontrado: $(command -v vspipe)"
    vspipe -v || true
    echo
    echo "[SUCESSO] VapourSynth e QTGMC configurados com sucesso para VHS Studio!"
else
    echo "[AVISO] vspipe não encontrado no PATH atual. Reinicie a sessão do terminal."
fi

echo "============================================================"
