#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT
source "$REPO_ROOT/lib/video-lib.sh"

usage() {
  cat <<'EOF'
INFO — 00_live_preview.sh

Preview ao vivo da captura VHS com escopos de vídeo e áudio em tempo real.
Nenhum arquivo é gravado. Útil para calibrar exposição, cor e sincronismo.

USAGE
  ./00_live_preview.sh [--scopes] [--help]
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 ./00_live_preview.sh
  DEV_VIDEO=/dev/video2 ./00_live_preview.sh --scopes

MODES
  (sem flags)  Preview simples com bwdif + idet (log de paridade no terminal)
  --scopes     Preview com waveform (luma) + vectorscope (cor) + medidor de áudio

ENV VARS (opcionais)
  DEV_VIDEO    Dispositivo V4L2    (padrão: /dev/video2)
  ALSA_DEV     Dispositivo ALSA   (padrão: hw:1,0)
  FRAMERATE    FPS de captura     (padrão: 25)
  VIDEO_SIZE   Resolução          (padrão: 720x576)
  INPUT_FMT    Formato V4L2       (padrão: yuyv422)
  AUDIO_RATE   Taxa de amostragem (padrão: 48000; recomendado: 96000)
  DEINT_VF     Filtro de deinterlace (padrão: bwdif=mode=1:parity=auto)

NOTES
  - O idet sempre loga estatísticas de paridade no terminal (TFF/BFF/unknown).
    Use isso para confirmar a paridade de campo ANTES de uma captura longa.
  - No modo --scopes, o layout é 2×2:
      [vídeo deinterlaced]  [waveform luma+chroma]
      [vectorscope cor]     [medidor de volume áudio]
  - Os escopos são úteis para calibrar a capturadora:
      waveform: luma deve estar entre 16-235 (range PAL legal)
      vectorscope: cor deve estar dentro do gráfico sem clipar
      volume: áudio deve peakar -12 a -6 dBFS sem clipar
EOF
}

# Parse args
SCOPES=0
for arg in "$@"; do
  case "$arg" in
    --scopes|-s) SCOPES=1;;
    -h|--help)   usage; exit 0;;
  esac
done
[[ -n "${HELP:-}" ]] && { usage; exit 0; }

DEV_VIDEO="${DEV_VIDEO:-/dev/video2}"
ALSA_DEV="${ALSA_DEV:-hw:1,0}"
FRAMERATE="${FRAMERATE:-25}"
VIDEO_SIZE="${VIDEO_SIZE:-720x576}"
INPUT_FMT="${INPUT_FMT:-yuyv422}"
AUDIO_RATE="${AUDIO_RATE:-48000}"
DEINT_VF="${DEINT_VF:-bwdif=mode=1:parity=auto}"

[[ -e "$DEV_VIDEO" ]] || { err "Video device not found: $DEV_VIDEO"; exit 1; }

info "Preview: $DEV_VIDEO ($INPUT_FMT $VIDEO_SIZE @ ${FRAMERATE}fps) | $ALSA_DEV (${AUDIO_RATE}Hz)"
[[ $SCOPES -eq 1 ]] && info "Modo escopos: waveform + vectorscope + volume meter"

in_video=( -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO" )
in_audio=( -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV" )

if [[ $SCOPES -eq 1 ]]; then
  # ── Modo com escopos (2×2 layout) ────────────────────────────────────────
  # top-left:  vídeo deinterlaced  (640×480)
  # top-right: waveform parade     (640×480)
  # bot-left:  vectorscope color   (480×480, padded para 640)
  # bot-right: audio volume meter  (640×480)
  #
  # O idet roda sobre o sinal RAW (antes do deinterlace) para medir paridade
  # de campo do sinal original — mais preciso do que medir no sinal 50p.

  filter_complex="
    [0:v]split=3[for_deint1][for_deint2][for_idet];
    [for_idet]idet,metadata=mode=print[idet_discard];
    [for_deint1]${DEINT_VF},scale=640:480:flags=lanczos[deint];
    [for_deint2]${DEINT_VF},
      waveform=mode=column:mirror=1:display=overlay:components=7:envelope=peak:filter=lowpass:scale=ire,
      scale=640:480:flags=lanczos[wf];
    [deint]vectorscope=mode=color2:envelope=peak:x=1:y=2,
      scale=480:480:flags=lanczos,
      pad=640:480:80:0[vs];
    [1:a]showvolume=f=0.95:b=4:w=640:h=480:dm=0:ds=log[audio_vol];
    [deint][wf]hstack[top];
    [vs][audio_vol]hstack[bot];
    [top][bot]vstack[out]
  "

  ffmpeg -hide_banner -loglevel warning \
    "${in_video[@]}" "${in_audio[@]}" \
    -filter_complex "$filter_complex" \
    -map "[out]" -map 1:a \
    -c:v rawvideo -pix_fmt yuv420p -c:a pcm_s16le -f matroska - \
  | ffplay -hide_banner -loglevel warning -window_title "VHS Preview — Escopos" -

else
  # ── Modo simples ──────────────────────────────────────────────────────────
  # bwdif deinterlace + idet para diagnóstico de paridade no terminal.
  # O idet imprime TFF/BFF/unknown no stderr (visível no terminal).

  VF="${DEINT_VF},idet"
  AF="aresample=async=1:first_pts=0"

  info "Filtros: $VF"
  info "idet: estatísticas de paridade de campo aparecem no terminal abaixo:"

  ffmpeg -hide_banner -loglevel info \
    "${in_video[@]}" "${in_audio[@]}" \
    -vf "$VF" -af "$AF" \
    -c:v rawvideo -pix_fmt yuv420p -c:a pcm_s16le -f matroska - \
  | ffplay -hide_banner -loglevel warning -window_title "VHS Preview" -
fi
