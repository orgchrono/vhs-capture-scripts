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
INFO — 02_stab_detect.sh

Analyse shaky footage and produce a transforms file (.trf) using vidstabdetect.
This step does not produce a video; it writes a .trf sidecar into stage 3.

USAGE
  ./02_stab_detect.sh INPUT.mkv [basename-for-trf] [--help]
  SHAKINESS=8 ACC=10 ./02_stab_detect.sh 3_motion_and_fps_correction/in_qtgmc50p.mkv

NOTES
  - The .trf file is written to stage_dir 3 with the provided basename (or input basename by default).
  - Use --help (or HELP=1) to view this info.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -n "${HELP:-}" ]]; then
  usage; exit 0
fi

SHAKINESS="${SHAKINESS:-8}"; ACC="${ACC:-10}"
IN="${1:-}"
[[ -n "$IN" ]] || { usage; exit 1; }
TRF_BASENAME="${2:-$(basename "${IN%.*}")}"
TRF="$(stage_dir 3)/${TRF_BASENAME}.trf"

# Ensure relative path without drive letter colons (e.g. C:) so ffmpeg filter parser never breaks
TRF_REL="media/work/stage_3/${TRF_BASENAME}.trf"
run_ffmpeg "${TRF%.trf}.log" -hide_banner -i "$IN" \
  -vf "vidstabdetect=shakiness=${SHAKINESS}:accuracy=${ACC}:result=${TRF_REL}" \
  -f null -
info "Wrote transforms: $TRF"
