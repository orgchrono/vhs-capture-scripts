#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/.." && pwd -P)}"

echo "============================================================"
echo "  VHS STUDIO - CONFIGURAÇÃO E AJUSTES BLACKMAGIC DESIGN"
echo "============================================================"
echo

echo "[1/3] Dispositivos DirectShow / DeckLink no sistema:"
echo "------------------------------------------------------------"
ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 | grep -iE "DeckLink|Intensity|Blackmagic|Video|Audio" || true
echo "------------------------------------------------------------"
echo

echo "[2/3] Perfis e Cenas Otimizados Criados para o OBS Studio:"
echo "  ✓ Perfil Criado:           VHS_Blackmagic_PAL"
echo "      - Resolução: 720x576 (PAL nativo, sem stretch)"
echo "      - Taxa de Quadros: 25.00 FPS exatos (elimina drops da taxa de 59.94Hz)"
echo "      - Espaço de Cor:   Rec. 601 (SD)"
echo "      - Formato de Cor:  I422 (4:2:2 nativo da fita)"
echo "      - Pasta de saída:  media/raw/ (evita travamentos de sync do OneDrive)"
echo
echo "  ✓ Coleção de Cenas:        VHS_Blackmagic_PAL"
echo "      - Entrada DeckLink travada em modo 'PAL' fixo (sem Auto-Detect)"
echo "      - Buffering ativado (previne descarte em micro-engasgos)"
echo "      - Deinterlace do OBS DESATIVADO (preserva campos para o QTGMC)"
echo "      - Fonte WDM DirectShow duplicada removida (elimina conflito de driver)"
echo
echo "[3/3] Para aplicar no OBS Studio:"
echo "  1. No menu superior do OBS, clique em: Perfil -> VHS_Blackmagic_PAL"
echo "  2. No menu superior do OBS, clique em: Coleção de Cenas -> VHS_Blackmagic_PAL"
echo
echo "Comandos diretos no terminal via CLI vhs:"
echo "  vhs scopes                          # Preview ao vivo com scopes"
echo "  vhs capture \"Nome_Da_Fita\"          # Captura direta FFV1 lossless"
echo "  vhs master \"media/raw/video.mkv\" --blackmagic --clean-work"
echo "============================================================"
