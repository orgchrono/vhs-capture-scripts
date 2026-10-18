#!/usr/bin/env bash
set -eo pipefail

echo "========================================================"
echo "  VHS Studio Pro - Production and Studio Environment"
echo "========================================================"

if [ ! -d ".venv" ]; then
    echo "[*] Creating isolated virtual environment .venv..."
    python3 -m uv venv .venv 2>/dev/null || python3 -m venv .venv
fi

echo "[*] Activating virtual environment..."
source .venv/bin/activate

echo "[*] Verifying Python and UI dependencies via FastDeps..."
python scripts/fast_deps.py

if [ "$1" == "--lint" ]; then
    echo "[*] Running Linters and Quality Gates..."
    if ! python scripts/lint.py; then
        echo ""
        echo "[ERROR] Code quality checks failed!"
        exit 1
    fi
fi

if [ "$1" == "--native" ]; then
    echo "[*] Starting VHS Studio Pro (Pure Native Rust Desktop Engine)..."
    exec cargo run --manifest-path src-tauri/Cargo.toml
fi

echo "[*] Starting VHS Studio Pro..."
exec python -m vhs_studio "$@"