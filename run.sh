#!/usr/bin/env bash
set -eo pipefail

echo "========================================================"
echo "  VHS Studio Pro - Production and Studio Environment"
echo "========================================================"

if [ ! -d "ui/node_modules" ]; then
    echo "[*] Installing UI dependencies..."
    npm --prefix ui ci
fi

if [ ! -d "ui/dist" ]; then
    echo "[*] Building UI bundle..."
    npm --prefix ui run build
fi

if [ "$1" == "--lint" ]; then
    echo "[*] Running Linters and Quality Gates..."
    if ! node scripts/lint.mts; then
        echo ""
        echo "[ERROR] Code quality checks failed!"
        exit 1
    fi
    exit 0
fi

echo "[*] Starting VHS Studio Pro (Native Desktop Suite with OS WebView)..."
exec cargo run -- "$@"