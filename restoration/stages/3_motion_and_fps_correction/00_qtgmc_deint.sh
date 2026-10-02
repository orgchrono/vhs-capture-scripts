#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works from any location)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"

IN=""; OUT=""; while [[ $# -gt 0 ]]; do case "$1" in
  --in) IN="$2"; shift 2;; --out) OUT="$2"; shift 2;; *) shift;; esac; done
[[ -n "$IN" ]] || err "Usage: $0 --in <TAPE_DIR> [--out <OUT_DIR>]"

pick_src(){ shopt -s nullglob
  local a=("$IN/2_restoration/"*.mkv) b=("$IN/1_raw/"*.mkv)
  if (( ${#a[@]} )); then printf "%s\n" "${a[@]}"; else printf "%s\n" "${b[@]}"; fi
}
mapfile -t files < <(pick_src)
(( ${#files[@]} )) || err "No inputs to deinterlace."

# Verify at least one is interlaced; warn and exit if all progressive
is_interlaced(){ ffprobe -v error -select_streams v:0 -show_entries stream=field_order \
  -of default=nw=1:nk=1 "$1" | grep -qiE 'tt|bb|tb|bt|unknown'; }
any=0; for f in "${files[@]}"; do if is_interlaced "$f"; then any=1; break; fi; done
(( any )) || err "All inputs appear progressive; QTGMC not applicable."

OUT="${OUT:-$IN/3_motion}"; mkdir -p "$OUT"
need() { command -v "$1" >/dev/null || err "Missing: $1"; }; need ffmpeg; need ffprobe

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
  OUTPUT_DIR  Optional. Defaults to stage 3 (3_motion_and_fps_correction).
  FIELD       Optional. Field order override:
              - TFF  : top field first (PAL common)  [default]
              - BFF  : bottom field first
              - AUTO : let QTGMC auto-detect (order=0)

NOTES
  - This script expects a sibling VapourSynth file: 00_qtgmc_deint.vpy
    The .vpy should reference the source via the environment variable VS_SRC.
  - We create a temporary .vpy if you request BFF or AUTO, by editing the TFF flag.
  - Audio is taken from the original input; if there is no audio stream, ffmpeg will
    warn about the missing map but still produce video.
  - Output suffix is "_qtgmc50p". A .log file of the exact commands is written.
  - Use --help (or HELP=1) to print this info.

ENV/DEPENDENCIES
  - Requires: vspipe, VapourSynth, QTGMC dependencies (havsfunc, mvtools, nnedi3/znedi3, fmtconv, ffms2/lsmas).
  - VS_SRC is set automatically to the absolute path of INPUT.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

command -v vspipe >/dev/null 2>&1 || { err "vspipe not found in PATH"; exit 1; }

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
FIELD="${3:-TFF}"  # TFF (PAL common), BFF, or AUTO
VPY="00_qtgmc_deint.vpy"

[[ -f "$VPY" ]] || { err "Missing VapourSynth script: $VPY (expected next to this .sh)"; exit 1; }
case "$FIELD" in
  TFF|BFF|AUTO) ;;
  *) err "Third arg must be TFF, BFF, or AUTO"; exit 1;;
esac

OUT="$(out_path "$IN" "$OUTDIR" "_qtgmc50p")"
LOG="${OUT%.*}.log"
ensure_dest "$OUT"

# Prepare a temp .vpy if we need to flip order or set AUTO
TMPVPY="$(mktemp --suffix=.vpy)"
if [[ "$FIELD" == "BFF" ]]; then
  # Flip explicit TFF=True -> TFF=False
  sed 's/TFF=True/TFF=False/' "$VPY" > "$TMPVPY"
elif [[ "$FIELD" == "AUTO" ]]; then
  # Replace explicit TFF=True with order=0 (QTGMC auto)
  # If your vpy uses a different parameter style, adapt this sed accordingly.
  sed 's/TFF=True/Order=0/' "$VPY" > "$TMPVPY"
else
  cp "$VPY" "$TMPVPY"
fi

# vspipe produces video only; bring audio from original input as a second ffmpeg input
export VS_SRC="$(realpath "$IN")"

{
  echo "----- $(date -Iseconds)"
  echo "vspipe --y4m $TMPVPY - | ffmpeg -hide_banner -i - -i \"$IN\" -map 0:v -map 1:a -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -c:a copy \"$OUT\""
} >> "$LOG"

set +e
vspipe --y4m "$TMPVPY" - \
| ffmpeg -hide_banner -i - -i "$IN" \
  -map 0:v -map 1:a \
  -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -c:a copy \
  "$OUT" 2>&1 | tee -a "$LOG"
rc=$?
set -e

rm -f "$TMPVPY"

if [[ $rc -ne 0 ]]; then
  err "QTGMC deinterlace failed (see log: ${LOG})"
  exit $rc
fi

info "Wrote: $OUT"
