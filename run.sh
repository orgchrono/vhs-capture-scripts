#!/bin/bash
set -e

echo "========================================================"
echo "  VHS Studio Pro - Ambiente de Desenvolvimento"
echo "========================================================"

if [ ! -d ".venv" ]; then
    echo "[*] Criando ambiente virtual isolado (.venv)..."
    python3 -m venv .venv
fi

echo "[*] Ativando ambiente virtual..."
source .venv/bin/activate

echo "[*] Garantindo que todas as dependencias estao atualizadas..."
python3 -m pip install --upgrade pip > /dev/null
python3 -m pip install -e .[dev,ai,cloud] > /dev/null

echo "[*] Rodando Linter e Type Checking (Flake8, Mypy, TSC)..."
if ! python3 scripts/lint.py; then
    echo ""
    echo "[ERRO] O codigo nao passou no crivo de qualidade!"
    echo "Corrija os erros listados acima antes de iniciar o servidor."
    exit 1
fi

echo "[*] Qualidade Aprovada! Iniciando o Servidor e a Interface..."
python3 -m vhs_studio