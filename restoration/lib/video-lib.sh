#!/usr/bin/env bash
# lib/video-lib.sh — Biblioteca central do pipeline VHS
# Inclua com: source "$REPO_ROOT/lib/video-lib.sh"

# ---------------------------------------------------------------------------
# Repo root (works when sourced from any depth)
# ---------------------------------------------------------------------------
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SELF_DIR/.." && pwd -P)"
export REPO_ROOT

# ---------------------------------------------------------------------------
# Logs coloridos
# ---------------------------------------------------------------------------
info(){ printf "\e[32m[INFO]\e[0m %s\n" "$*"; }
warn(){ printf "\e[33m[WARN]\e[0m %s\n" "$*"; }
err(){  printf "\e[31m[ERR ]\e[0m %s\n" "$*" >&2; }

# ---------------------------------------------------------------------------
# PATH: adiciona ffmpeg/ffprobe no Windows Git Bash se não estiver no PATH
# ---------------------------------------------------------------------------
if ! command -v ffmpeg >/dev/null 2>&1; then
  for _p in \
    "${LOCALAPPDATA:-}/Microsoft/WinGet/Links" \
    "/c/Users/${USERNAME:-danie}/AppData/Local/Microsoft/WinGet/Links" \
    "/c/ProgramData/chocolatey/bin" \
    "/c/ffmpeg/bin" \
    "/usr/local/bin"; do
    if [[ -d "$_p" ]] && ls "$_p"/ffmpeg* >/dev/null 2>&1; then
      export PATH="$_p:$PATH"
      break
    fi
  done
fi

# Falha rápida se as dependências críticas não estiverem disponíveis
for _cmd in ffmpeg ffprobe; do
  command -v "$_cmd" >/dev/null 2>&1 || { err "Missing dependency: $_cmd"; return 1 2>/dev/null || exit 1; }
done

# ---------------------------------------------------------------------------
# Defaults de dispositivo (sobrescríveis por profiles ou env)
# ---------------------------------------------------------------------------
: "${DEV_VIDEO:=/dev/video2}"
: "${ALSA_DEV:=hw:1,0}"
: "${FRAMERATE:=25}"
: "${VIDEO_SIZE:=720x576}"
: "${INPUT_FMT:=yuyv422}"
: "${AUDIO_RATE:=48000}"

# ---------------------------------------------------------------------------
# Carrega defaults e profile
# ---------------------------------------------------------------------------
[[ -f "$REPO_ROOT/config/defaults.env" ]] && source "$REPO_ROOT/config/defaults.env"
if [[ -n "${VHS_PROFILE:-}" && -f "$REPO_ROOT/profiles/${VHS_PROFILE}.env" ]]; then
  info "Using profile: ${VHS_PROFILE}"
  source "$REPO_ROOT/profiles/${VHS_PROFILE}.env"
fi

# ---------------------------------------------------------------------------
# stage_dir — mapeia número de stage para path de diretório
# ---------------------------------------------------------------------------
stage_dir() {
  local stg="$1"
  local proj_root
  proj_root="$(cd -- "$REPO_ROOT/.." && pwd -P)"
  local d
  case "$stg" in
    1)   d="$proj_root/media/raw" ;;
    2|3|4) d="$proj_root/media/work/stage_$stg" ;;
    5)   d="$proj_root/media/output" ;;
    *)   d="${2:-$(pwd)}/$stg" ;;
  esac
  mkdir -p "$d"
  printf "%s" "$d"
}

# ---------------------------------------------------------------------------
# out_path — constrói caminho de saída com sufixo
# Uso: out_path "/in/file.mkv" "/target/dir" "_suffix"
# ---------------------------------------------------------------------------
out_path() {
  local in="$1" outdir="$2" suf="${3:-}"
  local base
  base="$(basename "$in")"
  base="${base%.*}"
  mkdir -p "$outdir"
  echo "$outdir/${base}${suf}.mkv"
}

# ---------------------------------------------------------------------------
# ensure_dest — verifica se arquivo de saída já existe
# ---------------------------------------------------------------------------
ensure_dest() {
  local out="$1"
  if [[ -e "$out" ]]; then
    if [[ "${OVERWRITE:-0}" == "1" || -n "${FFMPEG_Y:-}" ]]; then
      rm -f "$out"
    else
      err "Output already exists (use OVERWRITE=1 to force): $out"
      return 1
    fi
  fi
}

# ---------------------------------------------------------------------------
# validate_video — verifica integridade de um intermediário após cada step.
# Uso: validate_video "/path/file.mkv" "nome do step"
# Falha se o arquivo não existir, estiver vazio ou duração = 0.
# ---------------------------------------------------------------------------
validate_video() {
  local file="$1"
  local step_name="${2:-arquivo}"

  if [[ ! -f "$file" ]]; then
    err "Validação falhou — arquivo não encontrado após '$step_name': $file"
    return 1
  fi

  local size=0
  size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
  if [[ "${size}" -lt 4096 ]]; then
    err "Validação falhou — arquivo muito pequeno (${size} bytes) após '$step_name': $file"
    return 1
  fi

  local dur="0"
  dur=$(ffprobe -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null || echo "0")
  if ! awk -v d="$dur" 'BEGIN{exit !(d+0 > 0.1)}'; then
    err "Validação falhou — duração inválida (${dur}s) após '$step_name': $file"
    return 1
  fi

  info "✓ $(basename "$file")  (${dur}s)"
}

# ---------------------------------------------------------------------------
# run_ffmpeg — wrapper que loga o comando antes de executar
# Uso: run_ffmpeg "logfile.log" [ffmpeg args...]
# ---------------------------------------------------------------------------
run_ffmpeg() {
  local log="$1"; shift
  { echo "----- $(date -Iseconds)"; printf 'ffmpeg %q ' "$@"; echo; } >> "$log"
  ffmpeg ${FFMPEG_Y:+"$FFMPEG_Y"} "$@" 2>&1 | tee -a "$log"
}

# ---------------------------------------------------------------------------
# cleanup_work — remove intermediários de um array de arquivos
# Uso: cleanup_work "${files_to_clean[@]}"
# ---------------------------------------------------------------------------
cleanup_work() {
  for f in "$@"; do
    if [[ -f "$f" ]]; then
      rm -f "$f"
      info "Removido intermediário: $(basename "$f")"
    fi
  done
}

# ---------------------------------------------------------------------------
# FFV1 archival defaults
# ---------------------------------------------------------------------------
# -c:a copy: áudio copiado sem recodificação nos stages intermediários.
# ATENÇÃO: Se o stage anterior usou filtros de áudio (atrim, asetpts),
# o timestamp do áudio foi reescrito e -c:a copy pode ser necessário ou
# pcm_s16le, dependendo do contexto. Cada script deve decidir.
ffv1_args=(-c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -c:a copy)
