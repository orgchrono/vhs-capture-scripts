#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works from any location)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"


usage() {
  cat <<'EOF'
INFO — Exposure/Colour Adjustment Script

Applies basic exposure and colour corrections using ffmpeg's `eq` and `colorbalance` filters.

Environment variables can be set to tune correction strength:

  BRIGHT   = -0.20..+0.20   (default 0.05)
  CONTRAST = 0.8..1.3       (default 1.10)
  SAT      = 0.9..1.4       (default 1.20)
  GAMMA    = 0.8..1.4       (default 1.20)
  CB_RS    = red shadows    (default 0.0)
  CB_BS    = blue shadows   (default 0.0, e.g. -0.05 to reduce blue cast)

USAGE
  ./01_exposure_color.sh INPUT.mkv [OUTPUT_DIR]

NOTES
  - Default output directory is stage 3 (3_motion_and_fps_correction).
  - Appends "_expcol" to the output filename.
  - Produces a FFV1/PCM MKV plus a .log of the exact ffmpeg command.
  - Use --help (or HELP=1) to print this info.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

# Adjust for each clip with flags below (examples are gentle starting points)
BRIGHT="${BRIGHT:-0.05}"     # -0.20..+0.20
CONTRAST="${CONTRAST:-1.10}" # 0.8..1.3
SAT="${SAT:-1.20}"           # 0.9..1.4
GAMMA="${GAMMA:-1.20}"       # 0.8..1.4
CB_RS="${CB_RS:-0.0}"        # colorbalance red shadows
CB_BS="${CB_BS:-0.0}"        # colorbalance blue shadows

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
OUT="$(out_path "$IN" "$OUTDIR" "_expcol")"
LOG="${OUT%.*}.log"

ensure_dest "$OUT"

vf="eq=brightness=${BRIGHT}:contrast=${CONTRAST}:saturation=${SAT}:gamma=${GAMMA},colorbalance=rs=${CB_RS}:bs=${CB_BS}"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
