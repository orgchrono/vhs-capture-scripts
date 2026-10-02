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
Segmentação não suportada neste modo; use 00_live_capture.sh para splitting.

USAGE
  ./00_capture_and_preview.sh [BaseName] [--help]
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 ./00_capture_and_preview.sh "TapeA"
  LIMIT="01:30:00" ./00_capture_and_preview.sh

NOTES
  - Pressione Q na janela do ffplay para parar o preview e a captura.
  - O arquivo arquivado é lossless (yuv422p, campos entrelaçados preservados).
  - O preview usa bwdif para mostrar a aparência do vídeo após deinterlace.
  - Defina PREVIEW_VF para substituir o filtro de preview.
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

[[ -e "$DEV_VIDEO" ]] || { err "Video device not found: $DEV_VIDEO"; exit 1; }
mkdir -p "$OUTDIR"

ts="$(date +'%Y-%m-%d_%H%M%S')"
base="${1:-capture_${ts}}"
outfile="$OUTDIR/${base}.mkv"
logfile="${outfile%.mkv}.log"

info "Capture+Preview → $outfile (press Q to stop)"
info "Source: $DEV_VIDEO ($INPUT_FMT $VIDEO_SIZE @ ${FRAMERATE}fps) | $ALSA_DEV (${AUDIO_RATE}Hz)"
info "Preview filter: $PREVIEW_VF"

in_video=( -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO" )
in_audio=( -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV" )

enc=( -map 0:v:0 -map 1:a:0
      -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -pix_fmt yuv422p
      -c:a pcm_s16le
      -af aresample=async=1:first_pts=0 )

dur=()
[[ -n "$LIMIT" ]] && dur=( -t "$LIMIT" )

# Tee: MKV arquivado no disco (sem filtros) + preview deinterlaced no ffplay
cmd=( ffmpeg -hide_banner \
    "${in_video[@]}" "${in_audio[@]}" \
    "${enc[@]}" "${dur[@]}" \
    -f tee -map 0:v -map 1:a \
    "[f=matroska]${outfile}|[vf=${PREVIEW_VF}:f=matroska]pipe:1" )

{
  echo "----- $(date -Iseconds)"
  printf '%s ' "${cmd[@]}"; echo
} >> "$logfile"

"${cmd[@]}" 2>&1 | tee -a "$logfile" | ffplay -hide_banner -loglevel warning -window_title "VHS Preview" -
info "Capture finished (file saved: $outfile)"
