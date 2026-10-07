#!/usr/bin/env bash
set -euo pipefail

VHS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$VHS_ROOT"

if [ ! -f ".venv/bin/python" ]; then
    echo "[VHS Studio] Criando ambiente virtual..."
    python3 -m venv .venv
    .venv/bin/python -m pip install -U pip setuptools
    .venv/bin/python -m pip install -e .
fi

exec .venv/bin/python -m vhs_studio "$@"
