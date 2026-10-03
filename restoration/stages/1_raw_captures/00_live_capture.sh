#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT
source "$REPO_ROOT/lib/video-lib.sh"

usage() {
  cat <<'EOF'
INFO — 00_live_capture.sh

Captura de alta fidelidade em MKV lossless (FFV1 4:2:2 + PCM s16le).
Preserva campos entrelaçados originais sem conversões internas.
Suporta Blackmagic DeckLink, DirectShow (Windows) e V4L2/ALSA (Linux).

USAGE
  ./00_live_capture.sh [BaseName] [--help]
  VHS_PROFILE=blackmagic ./00_live_capture.sh "Tape_01"
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 ./00_live_capture.sh "Tape_01"
  LIMIT="01:30:00" SPLIT_MIN=20 ./00_live_capture.sh "Tape_01"

ENV VARS
  DEV_VIDEO       Dispositivo (ex: "Intensity Shuttle", /dev/video2, "DeckLink Video Capture")
  ALSA_DEV        Dispositivo de áudio (ex: "DeckLink Audio Capture", hw:1,0)
  CAPTURE_SYSTEM  decklink, dshow, ou v4l2 (auto-detectado se omitido)
  DECKLINK_FORMAT pal (padrão 625i50 travado), ntsc
  DECKLINK_INPUT  composite ou s_video
  DECKLINK_AUDIO  analog
  FRAMERATE       25 (PAL) ou 29.97 (NTSC)
  VIDEO_SIZE      720x576 (PAL) ou 720x480 (NTSC)
  INPUT_FMT       uyvy422 (DeckLink) ou yuyv422 (EasyCAP)
  AUDIO_RATE      48000 ou 96000
  LIMIT           Duração máxima (ex: 01:30:00)
  SPLIT_MIN       Segmentar em N minutos
  OUTDIR          Diretório de saída (padrão: stage_dir 1 = media/raw)
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
SPLIT_MIN="${SPLIT_MIN:-}"
OUTDIR="${OUTDIR:-$(stage_dir 1)}"

# Validação do dispositivo
if [[ "$DEV_VIDEO" == /dev/* ]]; then
  [[ -e "$DEV_VIDEO" ]] || { err "Dispositivo de vídeo não encontrado: $DEV_VIDEO"; exit 1; }
fi

mkdir -p "$OUTDIR"

ts="$(date +'%Y-%m-%d_%H%M%S')"
base="${1:-capture_$ts}"
outfile="$OUTDIR/$base.mkv"
logfile="${outfile%.mkv}.log"

# Seleção automática do sistema de captura
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

info "Capturando para: $outfile"
info "Sistema: $sys | Dispositivo: $DEV_VIDEO | $VIDEO_SIZE @ ${FRAMERATE}fps"

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
  map_args=( -map 0:v:0 -map 0:a:0? )
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
  map_args=( -map 0:v:0 -map 0:a:0? )
else
  input_args=(
    -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO"
    -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV"
  )
  map_args=( -map 0:v:0 -map 1:a:0 )
fi

enc=(
  "${map_args[@]}"
  -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -pix_fmt yuv422p
  -c:a pcm_s16le
  -af aresample=async=1:first_pts=0
)

dur=()
[[ -n "$LIMIT" ]] && dur=( -t "$LIMIT" )

if [[ -n "$SPLIT_MIN" ]]; then
  seg_secs=$(( SPLIT_MIN * 60 ))
  cmd=( ffmpeg -hide_banner "${input_args[@]}" \
        "${enc[@]}" \
        -f segment -segment_time "$seg_secs" -reset_timestamps 1 \
        -strftime 1 "$OUTDIR/${base}_%Y-%m-%d_%H%M%S.mkv" )
else
  cmd=( ffmpeg -hide_banner "${input_args[@]}" "${enc[@]}" "${dur[@]}" "$outfile" )
fi

{ echo "----- $(date -Iseconds)"; printf '%q ' "${cmd[@]}"; echo; } >> "$logfile"
"${cmd[@]}" 2>&1 | tee -a "$logfile"
info "Captura concluída com sucesso: $outfile"
