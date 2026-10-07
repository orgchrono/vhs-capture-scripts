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
INFO — preview_compare.sh

Preview a video side-by-side with two different filter chains.
Uses ffplay to stack the outputs horizontally for visual comparison.

USAGE
  ./preview_compare.sh INPUT.mkv [VF1] [VF2]

ARGUMENTS
  INPUT.mkv   = input video
  VF1         = first video filter chain (default: eq=brightness=0.05:contrast=1.1:saturation=1.2:gamma=1.2)
  VF2         = second video filter chain (default: eq=brightness=0.00:contrast=1.0:saturation=1.0:gamma=1.0)

NOTES
  - Filters are ffmpeg-compatible expressions.
  - The two processed versions of the same video are shown side-by-side.
  - Use --help (or HELP=1) to print this info.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

IN="$1"
VF1="${2:-eq=brightness=0.05:contrast=1.1:saturation=1.2:gamma=1.2}"
VF2="${3:-eq=brightness=0.00:contrast=1.0:saturation=1.0:gamma=1.0}"

ffplay -hide_banner -vf "split[left][right];[left]${VF1}[l];[right]${VF2}[r];[l][r]hstack" "$IN"
