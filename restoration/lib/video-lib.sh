#!/usr/bin/env bash
set -euo pipefail



# Repo root resolution (works when called from anywhere)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SELF_DIR/.." && pwd -P)"
export REPO_ROOT

# Ensure ffmpeg/ffprobe on PATH if running in Windows Git Bash
if ! command -v ffmpeg >/dev/null 2>&1; then
  local_user="${USERNAME:-${USER:-danie}}"
  for p in "/c/Users/$local_user/AppData/Local/Microsoft/WinGet/Links" "/c/ProgramData/chocolatey/bin" "/c/ffmpeg/bin"; do
    if [[ -d "$p" && -x "$p/ffmpeg.exe" ]]; then
      export PATH="$p:$PATH"
      break
    fi
  done
fi

# Defaults (overridable via env or profiles)
: "${DEV_VIDEO:=/dev/video2}"
: "${ALSA_DEV:=hw:1,0}"
: "${FRAMERATE:=25}"
: "${VIDEO_SIZE:=720x576}"
: "${INPUT_FMT:=yuyv422}"
: "${AUDIO_RATE:=48000}"

info(){ printf "\e[32m[INFO]\e[0m %s\n" "$*"; }
warn(){ printf "\e[33m[WARN]\e[0m %s\n" "$*"; }
err(){  printf "\e[31m[ERR ]\e[0m %s\n" "$*" >&2; }

# Dependency checks
for cmd in ffmpeg ffprobe; do
  command -v "$cmd" &>/dev/null 2>&1 || { err "Missing dependency $cmd"; exit 1; }
done

# Load defaults & profile if available
[[ -f "$REPO_ROOT/config/defaults.env" ]] && source "$REPO_ROOT/config/defaults.env"
if [[ -n "${VHS_PROFILE:-}" && -f "$REPO_ROOT/profiles/${VHS_PROFILE}.env" ]]; then
  info "Using profile: ${VHS_PROFILE}"
  source "$REPO_ROOT/profiles/${VHS_PROFILE}.env"
fi

# Workspace helpers
stage_dir(){ # $1 = stage number (1..5), $2 optional base dir
  local stg="$1"
  local proj_root="$(cd -- "$REPO_ROOT/.." && pwd -P)"
  local d=""
  case "$stg" in
    1) d="$proj_root/media/raw" ;;
    2|3|4) d="$proj_root/media/work/stage_$stg" ;;
    5) d="$proj_root/media/output" ;;
    *) d="${2:-$(pwd)}/$stg" ;;
  esac
  mkdir -p "$d"
  printf "%s" "$d"
}

# Make output path from input + suffix in a target directory
# usage: out_path "/path/in.mkv" "/target/dir" "suffix"
out_path() {
  local in="$1"; local outdir="$2"; local suf="${3:-}"
  local base="$(basename "$in")"; base="${base%.*}"
  mkdir -p "$outdir"
  echo "$outdir/${base}${suf}.mkv"
}

ensure_dest() {
  local out="$1"
  if [[ -e "$out" ]]; then
    if [[ "${OVERWRITE:-0}" == "1" || -n "${FFMPEG_Y:-}" ]]; then
      rm -f "$out"
    else
      err "Output exists: $out"
      exit 1
    fi
  fi
}

# Safe ffmpeg wrapper that logs per-file and avoids overwrite unless passed to script
# usage: run_ffmpeg "logfile" ffmpeg args...
run_ffmpeg(){
  local log="$1"; shift
  { echo "----- $(date -Iseconds)"; printf 'ffmpeg %q ' "$@"; echo; } >> "$log"
  ffmpeg ${FFMPEG_Y:+"$FFMPEG_Y"} "$@" 2>&1 | tee -a "$log"
}

# Choose FFV1 archival lossless defaults
ffv1_args=(-c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -c:a copy)
# When you really want speed over size:
# ffv1_args=(-c:v ffv1 -level 3 -g 1 -c:a copy)

# Detect PAL field parity automatically (bwdif parity=auto is fine)
