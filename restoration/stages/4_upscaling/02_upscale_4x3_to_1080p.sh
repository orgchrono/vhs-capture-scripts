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
$(basename "$0") – Scale 4:3 to 1440x1080 and pad to 1920x1080 (pillarbox)

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

IN="$1"
OUTDIR="${2:-$(stage_dir 5)}"
OUT="$(out_path "$IN" "$OUTDIR" "_1080p_4x3")"
LOG="${OUT%.*}.log"

# Recompute scaling per frame (safer with varying SAR), then pillarbox to 1920x1080
vf="scale=1440:1080:flags=lanczos:eval=frame,pad=1920:1080:240:0"

ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
