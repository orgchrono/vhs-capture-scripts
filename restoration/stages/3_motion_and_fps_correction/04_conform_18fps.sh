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
$(basename "$0") – Corrects PAL 25fps capture of cine 18fps material

DESCRIPTION
  Cine film shot at 18fps was captured at PAL 25fps, making playback
  18/25 = 0.72x too fast (the film plays ~39% faster than it should).

  This filter applies setpts=PTS*(25/18) to SLOW DOWN the video to the
  correct speed, then resamples to an 18fps container for clean delivery.

  Timeline:
    camera: 18fps real-world  →  telecine/capture: 25fps PAL  →  THIS SCRIPT
    setpts=PTS*(25/18) restores original duration  →  output: 18fps MKV

  NOTE: Audio (if present) is NOT pitch-corrected here. If the tape has
  a sync audio track, use 03_audio_offset_helper.sh after this step to
  adjust pitch/speed of the audio to match.

Usage:
  $(basename "$0") INPUT [OUTPUT_DIR]

Arguments:
  INPUT        Source video file (captured at 25fps, actual content is 18fps)
  OUTPUT_DIR   Optional output directory (default: stage_dir 3)
USAGE
}

# Default behaviour: print usage unless args provided
if [[ ${1-} == "-h" || ${1-} == "--help" || $# -lt 1 ]]; then
  usage; exit 0
fi

IN="$1"
OUTDIR="${2:-$(stage_dir 3)}"
OUT="$(out_path "$IN" "$OUTDIR" "_18fps")"
LOG="${OUT%.*}.log"

# setpts=PTS*(25/18): expands timestamps by 25/18 factor → slows video to 18fps duration
# fps=18: sets the container FPS to 18 (no frame duplication — pure timestamp correction)
vf="setpts=PTS*(25/18),fps=18"
ensure_dest "$OUT"
run_ffmpeg "$LOG" -hide_banner -i "$IN" -vf "$vf" "${ffv1_args[@]}" "$OUT"
info "Wrote: $OUT"
