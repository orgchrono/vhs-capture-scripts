#!/usr/bin/env bash
set -eo pipefail

echo "========================================================"
echo "  VHS Studio Pro - Ambiente de Producao e Studio"
echo "========================================================"

if [ ! -d ".venv" ]; then
    echo "[*] Criando ambiente virtual isolado .venv..."
    python3 -m uv venv .venv 2>/dev/null || python3 -m venv .venv
fi

echo "[*] Ativando ambiente virtual..."
source .venv/bin/activate

echo "[*] Verificando dependencias Python e UI via FastDeps..."
python scripts/fast_deps.py

if [ "$1" == "--lint" ]; then
    echo "[*] Rodando Linter e Type Checking..."
    if ! python scripts/lint.py; then
        echo ""
        echo "[ERRO] O codigo nao passou no crivo de qualidade!"
        exit 1
    fi
fi

echo "[*] Iniciando o VHS Studio Pro..."
exec python -m vhs_studio "$@"