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
INFO — 00_qtgmc_deint.sh

Deinterlace to 50p using VapourSynth QTGMC.
This script wraps a VapourSynth pipeline defined in "00_qtgmc_deint.vpy" and muxes the
resulting video with the original audio. It writes a lossless FFV1/PCM (or copy) MKV.

USAGE
  ./00_qtgmc_deint.sh INPUT.mkv [OUTPUT_DIR] [TFF|BFF|AUTO]

ARGS
  INPUT.mkv   Required. Source capture (interlaced).
  OUTPUT_DIR  Optional. Defaults to stage 3.
  FIELD       Optional. Field order override:
              - TFF  : top field first (PAL common)  [default]
              - BFF  : bottom field first
              - AUTO : let QTGMC auto-detect (order=0)

NOTES
  - This script expects a sibling VapourSynth file: 00_qtgmc_deint.vpy
    The .vpy references the source via the environment variable VS_SRC.
  - Audio is taken from the original input; if there is no audio stream, ffmpeg will
    warn about the missing map but still produce video.
  - Output suffix is "_qtgmc50p". A .log file of the exact commands is written.
  - Use --help (or HELP=1) to print this info.

ENV VARS (optional, forwarded to the .vpy):
  VS_PRESET     : QTGMC quality preset (default: Slow)
  VS_EZDENOISE  : float — enable QTGMC built-in EZDenoise
  VS_SHARPNESS  : float 0..2 — QTGMC sharpness

ENV/DEPENDENCIES
  - Requires: vspipe, VapourSynth, havsfunc, mvtools, nnedi3/znedi3, fmtconv, ffms2/lsmas.
  - VS_SRC is set automatically to the absolute path of INPUT.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

command -v vspipe >/dev/null 2>&1 || { 
  err "vspipe not found in PATH."
  err "To use QTGMC, install VapourSynth + vspipe and plugins (havsfunc, mvtools, znedi3)."
  err "Alternative without external dependencies: use './01_deinterlace_bwdif.sh' (FFmpeg bwdif)."
  exit 1
}

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
FIELD="${3:-AUTO}"  # AUTO (default), TFF, or BFF
VPY="$(dirname -- "${BASH_SOURCE[0]}")/00_qtgmc_deint.vpy"

[[ -f "$VPY" ]] || { err "Missing VapourSynth script: $VPY (expected next to this .sh)"; exit 1; }
case "$FIELD" in
  TFF|BFF|AUTO) ;;
  *) err "Third arg must be TFF, BFF, or AUTO"; exit 1;;
esac

OUT="$(out_path "$IN" "$OUTDIR" "_qtgmc")"
LOG="${OUT%.*}.log"
ensure_dest "$OUT"

# Convert path for Windows native python/vspipe if running in Git Bash/MSYS
if command -v cygpath >/dev/null 2>&1; then
  export VS_SRC="$(cygpath -w "$(realpath "$IN")")"
  VS_VPY_ARG="$(cygpath -w "$VPY")"
else
  export VS_SRC="$(realpath "$IN")"
  VS_VPY_ARG="$VPY"
fi
export VS_FIELD="$FIELD"

{
  echo "----- $(date -Iseconds)"
  echo "VS_SRC=$VS_SRC VS_FIELD=$VS_FIELD vspipe --y4m \"$VS_VPY_ARG\" - | ffmpeg -hide_banner -i - -i \"$IN\" -map 0:v -map 1:a? -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -c:a copy \"$OUT\""
} >> "$LOG"

set +e
vspipe --y4m "$VS_VPY_ARG" - \
| ffmpeg -hide_banner -i - -i "$IN" \
  -map 0:v -map 1:a? \
  -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -c:a copy \
  "$OUT" 2>&1 | tee -a "$LOG"
rc=$?
set -e

if [[ $rc -ne 0 ]]; then
  err "QTGMC deinterlace failed (see log: ${LOG})"
  exit $rc
fi

info "Wrote: $OUT"
