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
INFO — 03_chroma_shift.sh

Corrects horizontal/vertical chroma misalignment using ffmpeg's `chromashift` filter.

Environment variables let you set the shift in pixels:

  W = horizontal chroma shift (default 2)
  H = vertical chroma shift   (default 1)

USAGE
  ./03_chroma_shift.sh INPUT.mkv [OUTPUT_DIR]

NOTES
  - Default output directory is stage 3 (3_motion_and_fps_correction).
  - Appends "_cshift" to the output filename.
  - Produces a FFV1/PCM MKV plus a .log of the exact ffmpeg command.
  - Use --help (or HELP=1) to print this info.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

W="${W:-2}"
H="${H:-1}"

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
OUT="$(out_path "$IN" "$OUTDIR" "_cshift")"
LOG="${OUT%.*}.log"

vf="chromashift=cbh=${W}:cbv=${H}:crh=${W}:crv=${H}:edge=smear"
ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
