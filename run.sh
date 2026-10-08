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

echo "[*] Iniciando o Servidor e a Interface..."
python3 -m vhs_studio