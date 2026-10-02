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
$(basename "$0") – PAL 25fps → 24fps (no interpolation)

Usage:
  $(basename "$0") INPUT [OUTPUT_DIR]

Arguments:
  INPUT        Source video file (e.g., input.mkv)
  OUTPUT_DIR   Optional output directory (default: stage_dir 3)
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

# PAL→24fps timing: setpts=PTS*(25/24) then set fps to 24
IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
OUT="$(out_path "$IN" "$OUTDIR" "_24fps")"
LOG="${OUT%.*}.log"

vf="setpts=PTS*(25/24),fps=24"
ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
