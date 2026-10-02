#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT
source "$REPO_ROOT/lib/video-lib.sh"

usage() {
  cat <<'EOF'
INFO — preview_hist.sh

Preview com escopos de vídeo: histograma, waveform, vectorscope ou todos juntos.
Nenhum arquivo é criado.

USAGE
  ./preview_hist.sh INPUT.mkv [hist|waveform|vector|all]
  ./preview_hist.sh INPUT.mkv               # all (padrão)
  ./preview_hist.sh INPUT.mkv waveform

MODES
  hist      Histograma RGB sobreposto
  waveform  Waveform parade de luma (range PAL: 16-235)
  vector    Vectorscope de cor (saturação e hue)
  all       Waveform + vectorscope side-by-side abaixo do vídeo (padrão)

NOTES
  - Use waveform para verificar se o range de luma está correto (branco/preto legais)
  - Use vector para verificar se as cores não estão saturadas demais ou descalibradas
  - Use --help (ou HELP=1) para ver esta ajuda
EOF
}

if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

IN="$1"
SCOPE="${2:-all}"

case "$SCOPE" in
  hist)
    ffplay -hide_banner -window_title "Histograma: $(basename "$IN")" \
      -vf "histogram=display_mode=overlay" "$IN"
    ;;
  waveform)
    ffplay -hide_banner -window_title "Waveform: $(basename "$IN")" \
      -vf "split[v][for_wf];
           [for_wf]waveform=mode=column:mirror=1:display=overlay:components=1:envelope=peak:filter=lowpass:scale=ire[wf];
           [v][wf]overlay" \
      "$IN"
    ;;
  vector)
    ffplay -hide_banner -window_title "Vectorscope: $(basename "$IN")" \
      -vf "split[v][for_vs];
           [for_vs]vectorscope=mode=color2:envelope=peak[vs];
           [v][vs]overlay=W-w:H-h" \
      "$IN"
    ;;
  all|*)
    # Vídeo original em cima; waveform + vectorscope lado a lado embaixo
    ffplay -hide_banner -window_title "Escopos: $(basename "$IN")" \
      -vf "split=3[v][for_wf][for_vs];
           [for_wf]waveform=mode=column:mirror=1:display=overlay:components=1:envelope=peak:filter=lowpass:scale=ire,scale=iw/2:ih/2[wf];
           [for_vs]vectorscope=mode=color2:envelope=peak,scale=iw/2:ih/2[vs];
           [wf][vs]hstack[scopes];
           [v]pad=iw:ih*1.5[v_pad];
           [v_pad][scopes]overlay=0:H-h" \
      "$IN"
    ;;
esac
