#!/usr/bin/env bash
# iniciar_desktop.sh - Lançador Desktop para macOS e Linux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

echo "============================================================"
echo "  Iniciando VHS Studio - Padrão Ouro Desktop..."
echo "============================================================"
echo

python3 "$SCRIPT_DIR/restoration/run_desktop.py"
