#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT
source "$REPO_ROOT/lib/video-lib.sh"

usage() {
  cat <<'EOF'
INFO — 00_capture_and_preview.sh

Captura lossless FFV1/PCM MKV + preview ao vivo via ffplay (tee muxer).
Suporta Blackmagic DeckLink, DirectShow (Windows) e V4L2/ALSA (Linux).

USAGE
  ./00_capture_and_preview.sh [BaseName] [--help]
  VHS_PROFILE=blackmagic ./00_capture_and_preview.sh "TapeA"
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 ./00_capture_and_preview.sh "TapeA"

NOTES
  - Pressione Q na janela do ffplay para parar o preview e a captura.
  - O arquivo gravado em disco é lossless (campos entrelaçados originais preservados).
  - O preview na tela usa bwdif para exibir movimento fluido de 50p ao vivo.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -n "${HELP:-}" ]]; then
  usage; exit 0
fi

DEV_VIDEO="${DEV_VIDEO:-/dev/video2}"
ALSA_DEV="${ALSA_DEV:-hw:1,0}"
FRAMERATE="${FRAMERATE:-25}"
VIDEO_SIZE="${VIDEO_SIZE:-720x576}"
INPUT_FMT="${INPUT_FMT:-yuyv422}"
AUDIO_RATE="${AUDIO_RATE:-48000}"
LIMIT="${LIMIT:-}"
OUTDIR="${OUTDIR:-$(stage_dir 1)}"
PREVIEW_VF="${PREVIEW_VF:-bwdif=mode=1:parity=auto}"

if [[ "$DEV_VIDEO" == /dev/* ]]; then
  [[ -e "$DEV_VIDEO" ]] || { err "Dispositivo de vídeo não encontrado: $DEV_VIDEO"; exit 1; }
fi
mkdir -p "$OUTDIR"

ts="$(date +'%Y-%m-%d_%H%M%S')"
base="${1:-capture_${ts}}"
outfile="$OUTDIR/${base}.mkv"
logfile="${outfile%.mkv}.log"

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

info "Capture+Preview → $outfile (Pressione Q na janela para parar)"
info "Sistema: $sys | Dispositivo: $DEV_VIDEO ($VIDEO_SIZE @ ${FRAMERATE}fps)"

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
  map_video="0:v"
  map_audio="0:a"
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
  map_video="0:v"
  map_audio="0:a"
else
  input_args=(
    -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO"
    -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV"
  )
  map_video="0:v"
  map_audio="1:a"
fi

enc=(
  -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -pix_fmt yuv422p
  -c:a pcm_s16le
  -af aresample=async=1:first_pts=0
)

dur=()
[[ -n "$LIMIT" ]] && dur=( -t "$LIMIT" )

cmd=( ffmpeg -hide_banner \
    "${input_args[@]}" \
    "${enc[@]}" "${dur[@]}" \
    -f tee -map "$map_video" -map "$map_audio" \
    "[f=matroska]${outfile}|[vf=${PREVIEW_VF}:f=matroska]pipe:1" )

{
  echo "----- $(date -Iseconds)"
  printf '%s ' "${cmd[@]}"; echo
} >> "$logfile"

"${cmd[@]}" 2>&1 | tee -a "$logfile" | ffplay -hide_banner -loglevel warning -window_title "VHS Preview ($sys)" -
info "Captura concluída (salvo em: $outfile)"
