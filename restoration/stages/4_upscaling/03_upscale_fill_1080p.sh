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
$(basename "$0") – Fit height then crop width to fill 16:9 at 1080p (minimal stretch)

Usage:
  $(basename "$0") INPUT [OUTPUT_DIR]

Arguments:
  INPUT        Source video file (e.g., input.mkv)
  OUTPUT_DIR   Optional output directory (default: stage_dir 5)
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

# Choice: fit height & crop width slightly to fill 16:9 without obvious stretch
IN="$1"
OUTDIR="${2:-$(stage_dir 5)}"
OUT="$(out_path "$IN" "$OUTDIR" "_1080p_fill")"
LOG="${OUT%.*}.log"

# For true 4:3 sources, scale height to 1080 and widen to 16:9, then center-crop to 1920x1080.
# eval=frame keeps scaling robust if SAR/metadata shifts mid-stream.
vf="scale=ih*16/9:ih:flags=lanczos:eval=frame,crop=1920:1080"

ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
