#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works from any location)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"

IN=""; OUT=""
while [[ $# -gt 0 ]]; do case "$1" in
  --in)  IN="$2"; shift 2;;
  --out) OUT="$2"; shift 2;;
  *) shift;;
esac; done

[[ -n "$IN" ]]  || err "Usage: $0 --in <TAPE_DIR> [--out <OUT_DIR>]"
[[ -d "$IN" ]]  || err "Tape dir not found: $IN"
OUT="${OUT:-$IN/1_raw}"
mkdir -p "$OUT" || err "Cannot create output dir: $OUT"

need() { command -v "$1" >/dev/null || err "Missing dependency: $1"; }
need ffmpeg; need ffplay
[[ -e "$DEV_VIDEO" ]] || err "Video device not found: $DEV_VIDEO"
OUT="${OUT:-$IN/1_raw}"; mkdir -p "$OUT"

usage() {
  cat <<'EOF'
INFO — 00_capture_and_preview.sh

Capture to a lossless FFV1/PCM MKV *and* live-preview via ffplay using the tee muxer.
Segmentation is not supported in this mode; use 00_live_capture.sh for splitting.

USAGE
  ./00_capture_and_preview.sh [CustomBaseName] [--help]
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 FRAMERATE=25 VIDEO_SIZE=720x576 INPUT_FMT=yuyv422 AUDIO_RATE=48000 ./00_capture_and_preview.sh "TapeA"
  LIMIT="01:30:00" ./00_capture_and_preview.sh
  OUTDIR=/abs/path ./00_capture_and_preview.sh

NOTES
  - Default OUTDIR is 1_raw_captures.
  - With no arguments, capture+preview starts immediately with a timestamped basename.
  - Use --help (or HELP=1) to view this info (no capture will start).
  - Press Q in the ffplay window to close the preview.
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
    LIMIT="${LIMIT:-}"             # e.g. "01:30:00"

# Default output directory: stage 1 (1_raw_captures), absolute path
OUTDIR="${OUTDIR:-$(stage_dir 1)}"
mkdir -p "$OUTDIR"

# Resolve output names
ts="$(date +'%Y-%m-%d_%H%M%S')"
base="${1:-capture_${ts}}"
outfile="$OUTDIR/${base}.mkv"
logfile="${outfile%.mkv}.log"

info "Capture+Preview → $outfile (press Q in ffplay window to stop preview)"
info "Source: $DEV_VIDEO ($INPUT_FMT, $VIDEO_SIZE @ ${FRAMERATE}fps) + $ALSA_DEV (${AUDIO_RATE} Hz)"

# Build input chains
in_video=( -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO" )
in_audio=( -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV" )

# Encoding for archival
enc=( -map 0:v:0 -map 1:a:0
      -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -pix_fmt yuv422p
      -c:a pcm_s16le
      -af aresample=async=1:first_pts=0 )

dur=()
[[ -n "$LIMIT" ]] && dur=( -t "$LIMIT" )

# Compose the tee pipeline: write MKV to disk and mkv to stdout -> ffplay
# Use bash -c to keep the pipe in a single command for logging.
cmd=( bash -c "
  ffmpeg -hide_banner ${in_video[*]} ${in_audio[*]} \
    ${enc[*]} ${dur[*]} \
    -f tee -map 0:v -map 1:a \"[f=matroska]${outfile}|[f=matroska]pipe:1\" \
  | ffplay -hide_banner -loglevel warning -
" )

{
  echo "----- $(date -Iseconds)"
  echo "ffmpeg (tee) → file + ffplay"
  printf '%s ' "${cmd[@]}"; echo
} >> "$logfile"

# Run and mirror logs
# shellcheck disable=SC2068
${cmd[@]} 2>&1 | tee -a "$logfile"

info "Capture finished (file saved: $outfile)"
