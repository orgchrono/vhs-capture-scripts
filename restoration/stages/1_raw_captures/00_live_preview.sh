#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works from any location)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"

need() { command -v "$1" >/dev/null || err "Missing dependency: $1"; }
need ffplay
[[ -e "$DEV_VIDEO" ]] || err "Video device not found: $DEV_VIDEO"
# ALSA can be optional for silent preview; warn instead of hard fail
if [[ -n "${ALSA_DEV:-}" && "$ALSA_DEV" != "none" ]]; then
  arecord -l >/dev/null 2>&1 || warn "ALSA not detected; audio preview may fail"
fi

usage() {
  cat <<'EOF'
INFO — 00_live_preview.sh

Preview the live input from the capture chain using ffmpeg piped to ffplay.
No files are written. Useful to verify interlacing, colour, and sync.
Environment variables let you override device defaults.

USAGE
  ./00_live_preview.sh [--help]
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 FRAMERATE=25 VIDEO_SIZE=720x576 INPUT_FMT=yuyv422 AUDIO_RATE=48000 ./00_live_preview.sh

NOTES
  - Filters: setfield=auto, idet (diagnostics), aresample=async=1:first_pts=0
  - Use --help (or HELP=1) to view this info.
  - With no arguments, the preview starts immediately (by design).
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -n "${HELP:-}" ]]; then
  usage; exit 0
fi

DEV_VIDEO="${DEV_VIDEO:-/dev/video}"
ALSA_DEV="${ALSA_DEV:-hw:1,0}"               # e.g. hw:1,0
FRAMERATE="${FRAMERATE:-25}"                 # PAL
VIDEO_SIZE="${VIDEO_SIZE:-720x576}"          # PAL capture frame
INPUT_FMT="${INPUT_FMT:-yuyv422}"            # MS210x native
AUDIO_RATE="${AUDIO_RATE:-48000}"

# Filters for *preview only* (don’t bake these into archival capture)
VF="${VF:-setfield=auto,idet,scale=iw:ih}"
AF="${AF:-aresample=async=1:first_pts=0}"

info "Preview from $DEV_VIDEO + $ALSA_DEV at $FRAMERATE fps, $VIDEO_SIZE ($INPUT_FMT)"

# Encode to a matroska stream in RAM and pipe to ffplay
ffmpeg -hide_banner -loglevel warning \
  -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO" \
  -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV" \
  -vf "$VF" -af "$AF" \
  -c:v rawvideo -pix_fmt yuv420p -c:a pcm_s16le -f matroska - \
| ffplay -hide_banner -loglevel warning -
