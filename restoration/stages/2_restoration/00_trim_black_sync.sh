#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT

source "$REPO_ROOT/lib/video-lib.sh"

usage() {
  cat <<'EOF'
INFO — 00_trim_black_sync.sh

Detects black frames and trims video and audio synchronously to eliminate
leading black frames, trailing black frames, and gaps without audio desync.

USAGE:
  ./00_trim_black_sync.sh INPUT.mkv [OUTPUT_DIR]
EOF
}

if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

INPUT="$1"
OUT_DIR="${2:-$(stage_dir 3)}"
mkdir -p "$OUT_DIR"

BASE="$(basename "${INPUT%.*}")"
OUTPUT="$OUT_DIR/${BASE}_trimmed.mkv"

info "Trimming black frames synchronously for: $INPUT"
python "$REPO_ROOT/stages/2_restoration/00_trim_black_sync.py" "$INPUT" "$OUTPUT"
info "Trimmed video saved to: $OUTPUT"
