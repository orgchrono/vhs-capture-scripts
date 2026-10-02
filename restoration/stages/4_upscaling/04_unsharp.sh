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
$(basename "$0") – Unsharp mask (sharpen)

Usage:
  $(basename "$0") INPUT [OUTPUT_DIR]

Arguments:
  INPUT        Source video file (e.g., input.mkv)
  OUTPUT_DIR   Optional output directory (default: stage_dir 5)

Environment (optional):
  L            Luma matrix size and amount (default: 5)
  C            Chroma matrix size and amount (default: 5)
  A            Amount/strength (default: 0.5)

Example:
  L=7 C=7 A=0.7 $(basename "$0") in.mkv
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

L="${L:-5}"; C="${C:-5}"; A="${A:-0.5}"
IN="$1"
OUTDIR="${2:-$(stage_dir 5)}"
OUT="$(out_path "$IN" "$OUTDIR" "_sharp")"
LOG="${OUT%.*}.log"

vf="unsharp=${L}:${C}:${A}"
ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
