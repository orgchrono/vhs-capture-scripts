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
INFO — 02_denoise_hqdn3d.sh

Applies temporal-spatial denoising using ffmpeg's `hqdn3d` filter.

Environment variables can be set to tune filter strength:

  LUMA   = luma spatial strength     (default 1.5)
  CHROMA = chroma spatial strength   (default 1.5)
  TL     = luma temporal strength    (default 6)
  TC     = chroma temporal strength  (default 6)

USAGE
  ./02_denoise_hqdn3d.sh INPUT.mkv [OUTPUT_DIR]

NOTES
  - Default output directory is stage 3 (3_motion_and_fps_correction).
  - Appends "_dn" to the output filename.
  - Produces a FFV1/PCM MKV plus a .log of the exact ffmpeg command.
  - Use --help (or HELP=1) to print this info.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

LUMA="${LUMA:-1.5}"
CHROMA="${CHROMA:-1.5}"
TL="${TL:-6}"
TC="${TC:-6}"

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
OUT="$(out_path "$IN" "$OUTDIR" "_dn")"
LOG="${OUT%.*}.log"

vf="hqdn3d=${LUMA}:${CHROMA}:${TL}:${TC}"
ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
