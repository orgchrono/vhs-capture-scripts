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
INFO — 01_deinterlace_bwdif.sh

Deinterlace using ffmpeg's `bwdif` (Bob Weaver deinterlacing filter).
Outputs lossless FFV1 video, copying audio settings from video-lib's defaults.

Environment variable overrides:
  MODE   : 0=send_frame (same framerate), 1=send_field (double rate) [default 1]
  PARITY : tff | bff | auto                                         [default auto]
  DEINT  : all | interlaced                                          [default all]

USAGE
  ./01_deinterlace_bwdif.sh INPUT.mkv [OUTPUT_DIR]

NOTES
  - Default OUTPUT_DIR is stage 3 (3_motion_and_fps_correction).
  - Appends "_bwdif" to the output filename.
  - Produces a FFV1/PCM MKV plus a .log with the exact command.
  - Use --help (or HELP=1) to print this info.

Examples
  MODE=1 PARITY=auto ./01_deinterlace_bwdif.sh 2_restoration/clip.mkv
  MODE=0 PARITY=tff  ./01_deinterlace_bwdif.sh input.mkv "$(stage_dir 3)"
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
OUT="$(out_path "$IN" "$OUTDIR" "_bwdif")"
LOG="${OUT%.*}.log"

MODE="${MODE:-1}"         # 1 = double-rate (50p from 25i)
PARITY="${PARITY:-auto}"  # auto|tff|bff
DEINT="${DEINT:-all}"     # all|interlaced

vf="bwdif=mode=${MODE}:parity=${PARITY}:deint=${DEINT}"

ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
