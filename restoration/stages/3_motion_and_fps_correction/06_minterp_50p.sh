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
$(basename "$0") – Motion-interpolated 50p conversion

Usage:
  $(basename "$0") INPUT [OUTPUT_DIR]

Arguments:
  INPUT        Source video file (e.g., input.mkv)
  OUTPUT_DIR   Optional output directory (default: stage_dir 4)
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

IN="$1"
OUTDIR="${2:-$(stage_dir 4)}"
OUT="$(out_path "$IN" "$OUTDIR" "_50p")"
LOG="${OUT%.*}.log"

# Interpolate to 50 fps, then normalize timestamps/cadence explicitly.
vf="minterpolate=fps=50:mi_mode=mci:mc_mode=aobmc:me_mode=bidir,fps=50:round=down:start_time=0"

ensure_dest "$OUT"

run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"

info "Wrote: $OUT"
