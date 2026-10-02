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
INFO — preview_histogram.sh

Preview a video with ffmpeg's `histogram` filter applied.
This is useful to visualize luma/chroma distribution and check exposure/colour balance.

USAGE
  ./preview_histogram.sh INPUT.mkv

ARGUMENTS
  INPUT.mkv   = input video

NOTES
  - Runs via ffplay (no output file is created).
  - Use --help (or HELP=1) to print this info.
EOF
}

# Show usage if no args or help requested
if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -n "${HELP:-}" ]]; then
  usage; exit 0
fi

IN="$1"
ffplay -hide_banner -vf "histogram" "$IN"
