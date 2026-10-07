#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/.." && pwd -P)}"

echo "============================================================"
echo "  VHS STUDIO - CONFIGURAÇÃO E AJUSTES BLACKMAGIC DESIGN"
echo "============================================================"
echo

echo "[1/3] Verificando dispositivos de captura Blackmagic / DirectShow..."
echo "------------------------------------------------------------"
ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 | grep -iE "DeckLink|Intensity|Blackmagic|Video|Audio" || true
echo "------------------------------------------------------------"
echo

echo "[2/3] Cadeia de Equipamentos Calibrada:"
echo "  ✓ VCR/Câmera:     JVC HR-D227M (Estéreo) ou JVC GR-AX410 (VHS-C Mono)"
echo "  ✓ TBC Passthrough: Panasonic DMR-EH55 (Linha e Quadro estáveis)"
echo "  ✓ Captura:        Blackmagic Intensity Shuttle USB 3.0 (DeckLink)"
echo
echo "  ✓ Perfil OBS:     VHS Archive"
echo "      - Resolução:   720x486 (NTSC analógico completo sem stretch)"
echo "      - Taxa:        29.970 FPS (NTSC padrão de fita)"
echo "      - Deinterlace: DESATIVADO no OBS (preserva sinal raw para o pipeline)"
echo

echo "[3/3] Comandos úteis do pipeline:"
echo "  $REPO_ROOT/run_pipeline.bat               # Restauração direta frame-accurate"
echo "  $REPO_ROOT/bin/vhs master [arquivo]       # Pipeline master via Bash"
echo "============================================================"
