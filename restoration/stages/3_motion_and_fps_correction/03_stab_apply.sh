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
INFO — 03_stab_apply.sh

Apply stabilisation using a .trf transforms file with vidstabtransform.
Writes a new FFV1/PCM MKV into stage 3 with suffix _stab.

USAGE
  ./03_stab_apply.sh INPUT.mkv [transforms.trf] [output_dir] [--help]
  SMOOTH=20 ./03_stab_apply.sh 3_motion_and_fps_correction/in_qtgmc50p.mkv

NOTES
  - If transforms.trf is omitted, the script looks for stage_dir 3/<INPUT_BASENAME>.trf
  - Use --help (or HELP=1) to view this info.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -n "${HELP:-}" ]]; then
  usage; exit 0
fi

SMOOTH="${SMOOTH:-20}"
IN="${1:-}"
[[ -n "$IN" ]] || { usage; exit 1; }
TRF_PATH="${2:-$(stage_dir 3)/$(basename "${IN%.*}").trf}"
OUTDIR="${3:-$(stage_dir 3)}"

OUT="$(out_path "$IN" "$OUTDIR" "_stab")"
LOG="${OUT%.*}.log"

[[ -e "$TRF_PATH" ]] || { err "Missing transforms file: $TRF_PATH (run 02_stab_detect.sh first)"; exit 1; }
TRF_REL="media/work/stage_3/$(basename "$TRF_PATH")"
vf="vidstabtransform=smoothing=${SMOOTH}:input=${TRF_REL}"
ensure_dest "$OUT"

run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
