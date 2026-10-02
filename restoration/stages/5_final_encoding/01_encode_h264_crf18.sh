#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works from any location)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"


usage() {
  cat >&2 <<USAGE
$(basename "$0") – Encode to H.264 MP4 (yuv420p), AAC audio

Usage:
  $(basename "$0") INPUT [OUTPUT]

Arguments:
  INPUT        Source video (e.g., input_from_upscaling.mkv)
  OUTPUT       Optional output path (default: INPUT basename + "_h264.mp4")

Environment (optional):
  CRF          x264 constant rate factor (default: 18)
  PRESET       x264 preset (default: slow)

Notes:
  - Sets BT.470BG color metadata (primaries/transfer/matrix). Remove those flags if your toolchain objects.
  - Audio encoded AAC 192k.

Example:
  CRF=20 PRESET=medium $(basename "$0") in.mkv out.mp4
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

CRF="${CRF:-18}"; PRESET="${PRESET:-slow}"
IN="$1"
OUT="${2:-${IN%.*}_h264.mp4}"
LOG="${OUT%.*}.log"

ensure_dest "$OUT"

# PAL SD heritage: tag colorimetry to bt470bg (metadata; safe to omit if it causes trouble)
run_ffmpeg "$LOG" -hide_banner -i "$IN" \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -pix_fmt yuv420p \
  -color_primaries bt470bg -color_trc bt470bg -colorspace bt470bg \
  -c:a aac -b:a 192k \
  "$OUT"

info "Wrote: $OUT"
