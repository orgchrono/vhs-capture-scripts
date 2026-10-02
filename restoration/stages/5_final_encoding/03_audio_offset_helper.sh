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
$(basename "$0") – Shift audio by OFFSET seconds (lossless video copy)

Usage:
  OFFSET=±seconds $(basename "$0") INPUT [OUTPUT_DIR]

Arguments:
  INPUT        Source video (e.g., input.mkv)
  OUTPUT_DIR   Optional output directory (default: .)

Environment (required/optional):
  OFFSET       Audio time shift in seconds. Positive delays audio, negative advances.
               Example: OFFSET=-0.200  (audio earlier by 200 ms)
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

# Positive OFFSET delays audio; negative advances, e.g. OFFSET="-0.200" (sec)
OFFSET="${OFFSET:-0.200}"

IN="$1"
OUTDIR="${2:-.}"
OUT="$(out_path "$IN" "$OUTDIR" "_aoffset")"
LOG="${OUT%.*}.log"

ensure_dest "$OUT"

# Split streams to adjust audio timing without re-encoding video (lossless copy)
run_ffmpeg "$LOG" -hide_banner -i "$IN" \
  -itsoffset "$OFFSET" -i "$IN" \
  -map 0:v -map 1:a -c:v copy -c:a copy \
  "$OUT"

info "Wrote: $OUT (audio shifted by ${OFFSET}s)"
