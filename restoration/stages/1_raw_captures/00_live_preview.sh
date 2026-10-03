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
Suporta Blackmagic DeckLink, DirectShow (Windows) e V4L2/ALSA (Linux).
Nenhum arquivo é gravado. Útil para calibrar exposição, cor e sincronismo.

USAGE
  ./00_live_preview.sh [--scopes] [--help]
  VHS_PROFILE=blackmagic ./00_live_preview.sh --scopes
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 ./00_live_preview.sh

MODES
  (sem flags)  Preview simples com bwdif + idet (log de paridade no terminal)
  --scopes     Preview com waveform (luma) + vectorscope (cor) + medidor de áudio

ENV VARS (opcionais)
  DEV_VIDEO       Dispositivo (ex: "Intensity Shuttle", /dev/video2)
  ALSA_DEV        Dispositivo ALSA ou DirectShow áudio
  CAPTURE_SYSTEM  decklink, dshow, v4l2
  FRAMERATE       FPS de captura (padrão: 25)
  VIDEO_SIZE      Resolução (padrão: 720x576)
  DEINT_VF        Filtro de deinterlace (padrão: bwdif=mode=1:parity=auto)
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

if [[ "$DEV_VIDEO" == /dev/* ]]; then
  [[ -e "$DEV_VIDEO" ]] || { err "Dispositivo de vídeo não encontrado: $DEV_VIDEO"; exit 1; }
fi

# Seleção automática de sistema
sys="${CAPTURE_SYSTEM:-}"
if [[ -z "$sys" ]]; then
  if [[ "$DEV_VIDEO" =~ (DeckLink|Intensity|decklink) ]]; then
    sys="decklink"
  elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "${WINDIR:-}" ]]; then
    sys="dshow"
  else
    sys="v4l2"
  fi
fi

info "Preview: $DEV_VIDEO ($VIDEO_SIZE @ ${FRAMERATE}fps) [Sistema: $sys]"
[[ $SCOPES -eq 1 ]] && info "Modo escopos: waveform + vectorscope + volume meter"

if [[ "$sys" == "decklink" ]]; then
  input_args=(
    -f decklink
    -format_code "${DECKLINK_FORMAT:-pal}"
    -video_input "${DECKLINK_INPUT:-composite}"
    -audio_input "${DECKLINK_AUDIO:-analog}"
    -draw_bars 0
    -queue_size "${QUEUE_SIZE:-1073741824}"
    -i "$DEV_VIDEO"
  )
  audio_idx="0"
  map_audio="0:a?"
elif [[ "$sys" == "dshow" ]]; then
  audio_dshow=""
  [[ -n "${ALSA_DEV:-}" && "$ALSA_DEV" != "none" ]] && audio_dshow=":audio=${ALSA_DEV}"
  input_args=(
    -f dshow
    -rtbufsize "${BUFFER_SIZE:-1024M}"
    -thread_queue_size 4096
    -video_size "$VIDEO_SIZE"
    -framerate "$FRAMERATE"
    -pixel_format "${INPUT_FMT:-uyvy422}"
    -i "video=${DEV_VIDEO}${audio_dshow}"
  )
  audio_idx="0"
  map_audio="0:a?"
else
  input_args=(
    -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO"
    -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV"
  )
  audio_idx="1"
  map_audio="1:a"
fi

if [[ $SCOPES -eq 1 ]]; then
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
    [${audio_idx}:a]showvolume=f=0.95:b=4:w=640:h=480:dm=0:ds=log[audio_vol];
    [deint][wf]hstack[top];
    [vs][audio_vol]hstack[bot];
    [top][bot]vstack[out]
  "

  ffmpeg -hide_banner -loglevel warning \
    "${input_args[@]}" \
    -filter_complex "$filter_complex" \
    -map "[out]" -map "$map_audio" \
    -c:v rawvideo -pix_fmt yuv420p -c:a pcm_s16le -f matroska - \
  | ffplay -hide_banner -loglevel warning -window_title "VHS Preview — Escopos ($sys)" -

else
  VF="${DEINT_VF},idet"
  AF="aresample=async=1:first_pts=0"

  info "Filtros: $VF"
  info "idet: estatísticas de paridade de campo aparecem no terminal:"

  ffmpeg -hide_banner -loglevel info \
    "${input_args[@]}" \
    -vf "$VF" -af "$AF" \
    -c:v rawvideo -pix_fmt yuv420p -c:a pcm_s16le -f matroska - \
  | ffplay -hide_banner -loglevel warning -window_title "VHS Preview ($sys)" -
fi
