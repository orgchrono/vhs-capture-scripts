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
$(basename "$0") – Encode to Apple ProRes (prores_ks)

Usage:
  $(basename "$0") INPUT [OUTPUT]

Arguments:
  INPUT        Source video (e.g., input_from_upscaling.mkv)
  OUTPUT       Optional output path (default: INPUT basename + "_prores.mov")

Environment (optional):
  PROFILE      ProRes profile for prores_ks (default: 3)
               0=proxy, 1=LT, 2=standard, 3=HQ, 4=4444, 5=4444 XQ

Notes:
  - Video: prores_ks, pixel format yuv422p10le
  - Audio: PCM 16-bit little-endian
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

PROFILE="${PROFILE:-3}" # 0=proxy, 3=HQ, 5=4444 XQ
IN="$1"
OUT="${2:-${IN%.*}_prores.mov}"
LOG="${OUT%.*}.log"

ensure_dest "$OUT"

run_ffmpeg "$LOG" -hide_banner -i "$IN" \
  -c:v prores_ks -profile:v "$PROFILE" -pix_fmt yuv422p10le \
  -c:a pcm_s16le \
  "$OUT"

info "Wrote: $OUT"
