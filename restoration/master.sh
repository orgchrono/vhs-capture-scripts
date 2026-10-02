#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (works from any location)
SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$SELF_DIR"
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

# Basic dependency checks
for cmd in ffmpeg ffprobe; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing dependency: $cmd" >&2; exit 1; }
done

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"

cd "$REPO_ROOT"

usage() {
  cat <<'EOF'
Usage:
  master.sh INPUT.mkv [pipeline options]
  master.sh --preview [device options]
  master.sh --capture[=NAME] [device options] [--limit HH:MM:SS] [--split-min N] [pipeline options]
  master.sh --capture-and-preview[=NAME] [device options] [--limit HH:MM:SS] [pipeline options]
Modes:
  --vhs                 Treat as interlaced VHS (deint->stabilise->50p)
  --cine18              Cine @ 18 fps (conform->50p)
  --cine24              Cine @ 24 fps (conform->50p)
  --guess               Heuristic (default): no audio => cine18, else VHS
Pre-capture / Preview:
  --preview             Open live preview and exit
  --capture[=NAME]      Capture to 1_raw_captures/ (NAME optional; default timestamp)
  --capture-and-preview[=NAME]
                        Capture to file and live preview (no segmentation in this mode)
  --only-capture        Stop after capture (do not process further)
Device/options for preview/capture (forwarded as env to scripts):
  --dev-video PATH      e.g. /dev/video2
  --alsa-dev STR        e.g. hw:1,0
  --framerate N         e.g. 25
  --video-size WxH      e.g. 720x576
  --input-fmt STR       e.g. yuyv422
  --audio-rate N        e.g. 48000
  --limit HH:MM:SS      Stop capture after duration (e.g. 01:30:00)
  --split-min N         Segment capture in N-minute chunks (capture-only mode)
Deinterlace:
  --qtgmc[=TFF|BFF|AUTO]   Use VapourSynth QTGMC (best; default TFF for PAL)
  --bwdif                  Use ffmpeg bwdif (fallback)
Enhancements:
  --trim-black          Remove black frames/gaps with synchronous A/V cut
  --expcol              Exposure/colour (eq + colorbalance)
  --denoise             Light hqdn3d denoise
  --chroma-fix          Reduce chroma bleed
  --sharpen             Gentle unsharp after upscale
Framing & delivery:
  --fill16x9            Crop/scale to fill 16:9 (default is 4:3 pillarbox)
  --prores              Final encode as ProRes MOV (default H.264 MP4)
  --crf N               CRF for H.264 (default 18)
  --clean-work          Remove intermediate work files after successful final encode
  -y                    Allow overwriting where underlying steps use -y
  -h|--help             Show help and exit
Examples:
  master.sh --preview --dev-video /dev/video0
  master.sh --capture="Family_Tape_1998" --limit 01:30:00 --split-min 20 --vhs --qtgmc --denoise
  master.sh 1_raw_captures/clip.mkv --guess --bwdif --fill16x9 --prores
EOF
}

# Defaults
IN=""
MODE="guess"
DEINT="qtgmc"
FIELD="TFF"
TRIM_BLACK=0
APPLY_DENOISE=0
APPLY_CHROMA=0
APPLY_EXPCOL=0
APPLY_SHARP=0
FILL16X9=0
FINAL="h264"
CRF=18
FFMPEG_Y=""
DO_PREVIEW=0
DO_CAPTURE=0
DO_CAP_PREVIEW=0
CAPTURE_NAME=""
ONLY_CAPTURE=0
DEV_VIDEO=""
ALSA_DEV=""
FRAMERATE=""
VIDEO_SIZE=""
INPUT_FMT=""
AUDIO_RATE=""
CAP_LIMIT=""
CAP_SPLIT_MIN=""
CLEAN_WORK=0      # --clean-work: remove intermediários após encode final bem-sucedido

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --preview) DO_PREVIEW=1;;
    --capture) DO_CAPTURE=1;;
    --capture=*) DO_CAPTURE=1; CAPTURE_NAME="${1#--capture=}";;
    --capture-and-preview) DO_CAP_PREVIEW=1;;
    --capture-and-preview=*) DO_CAP_PREVIEW=1; CAPTURE_NAME="${1#--capture-and-preview=}";;
    --only-capture) ONLY_CAPTURE=1;;
    --dev-video) shift; DEV_VIDEO="${1:?value}";;
    --alsa-dev) shift; ALSA_DEV="${1:?value}";;
    --framerate) shift; FRAMERATE="${1:?value}";;
    --video-size) shift; VIDEO_SIZE="${1:?value}";;
    --input-fmt) shift; INPUT_FMT="${1:?value}";;
    --audio-rate) shift; AUDIO_RATE="${1:?value}";;
    --limit) shift; CAP_LIMIT="${1:?value}";;
    --split-min) shift; CAP_SPLIT_MIN="${1:?value}";;
    --cine18) MODE="cine18";;
    --cine24) MODE="cine24";;
    --vhs) MODE="vhs";;
    --guess) MODE="guess";;
    --qtgmc) DEINT="qtgmc"; FIELD="TFF";;
    --qtgmc=*) DEINT="qtgmc"; FIELD="${1#--qtgmc=}";;
    --bwdif) DEINT="bwdif";;
    --trim-black|--remove-black) TRIM_BLACK=1;;
    --denoise) APPLY_DENOISE=1;;
    --chroma-fix) APPLY_CHROMA=1;;
    --expcol) APPLY_EXPCOL=1;;
    --sharpen) APPLY_SHARP=1;;
    --fill16x9) FILL16X9=1;;
    --prores) FINAL="prores";;
    --crf) shift; CRF="${1:?value}";;
    -y) FFMPEG_Y="-y"; export OVERWRITE=1; export FFMPEG_Y;;
    --clean-work) CLEAN_WORK=1;;
    -h|--help) usage; exit 0;;
    -*)
      err "Unknown option: $1"; usage; exit 1;;
    *)
      if [[ -z "$IN" ]]; then IN="$1"; else err "Unexpected positional arg: $1"; usage; exit 1; fi;;
  esac
  shift || true
done

# Helper to export env vars to child scripts
build_env() {
  local e=()
  [[ -n "$DEV_VIDEO" ]]   && e+=( DEV_VIDEO="$DEV_VIDEO" )
  [[ -n "$ALSA_DEV" ]]    && e+=( ALSA_DEV="$ALSA_DEV" )
  [[ -n "$FRAMERATE" ]]   && e+=( FRAMERATE="$FRAMERATE" )
  [[ -n "$VIDEO_SIZE" ]]  && e+=( VIDEO_SIZE="$VIDEO_SIZE" )
  [[ -n "$INPUT_FMT" ]]   && e+=( INPUT_FMT="$INPUT_FMT" )
  [[ -n "$AUDIO_RATE" ]]  && e+=( AUDIO_RATE="$AUDIO_RATE" )
  [[ -n "$CAP_LIMIT" ]]   && e+=( LIMIT="$CAP_LIMIT" )
  [[ -n "$CAP_SPLIT_MIN" ]] && e+=( SPLIT_MIN="$CAP_SPLIT_MIN" )
  echo "${e[@]-}"
}

# PREVIEW
if [[ $DO_PREVIEW -eq 1 ]]; then
  info "Opening live preview..."
  env $(build_env) "$REPO_ROOT/stages/1_raw_captures/00_live_preview.sh"
  exit 0
fi

# CAPTURE & PREVIEW (tee)
if [[ $DO_CAP_PREVIEW -eq 1 && -n "$CAP_SPLIT_MIN" ]]; then
  warn "Segmentation (--split-min) is not supported with --capture-and-preview; ignoring."
fi
if [[ $DO_CAP_PREVIEW -eq 1 && $DO_CAPTURE -eq 1 ]]; then
  err "Choose either --capture or --capture-and-preview, not both."; exit 1
fi
if [[ $DO_CAP_PREVIEW -eq 1 ]]; then
  info "Starting capture+preview..."
  if [[ -n "$CAPTURE_NAME" ]]; then
    env $(build_env) "$REPO_ROOT/stages/1_raw_captures/00_capture_and_preview.sh" "$CAPTURE_NAME"
  else
    env $(build_env) "$REPO_ROOT/stages/1_raw_captures/00_capture_and_preview.sh"
  fi
  if [[ -n "$CAPTURE_NAME" ]]; then
    newest="$(ls -1t "$(stage_dir 1)/${CAPTURE_NAME}"*.mkv 2>/dev/null | head -n1 || true)"
    if [[ -n "$newest" ]]; then IN="$newest"; else IN="$(stage_dir 1)/${CAPTURE_NAME}.mkv"; fi
  else
    IN="$(ls -1t "$(stage_dir 1)"/*.mkv | head -n1)"
  fi
  info "Using captured file: $IN"
  if [[ $ONLY_CAPTURE -eq 1 ]]; then info "ONLY_CAPTURE set; exiting after capture."; exit 0; fi
fi

# CAPTURE
if [[ $DO_CAPTURE -eq 1 ]]; then
  info "Starting capture..."
  if [[ -n "$CAPTURE_NAME" ]]; then
    env $(build_env) "$REPO_ROOT/stages/1_raw_captures/00_live_capture.sh" "$CAPTURE_NAME"
  else
    env $(build_env) "$REPO_ROOT/stages/1_raw_captures/00_live_capture.sh"
  fi
  if [[ -z "$CAPTURE_NAME" ]]; then
    IN="$(ls -1t "$(stage_dir 1)"/*.mkv | head -n1)"
  else
    newest="$(ls -1t "$(stage_dir 1)/${CAPTURE_NAME}"*.mkv 2>/dev/null | head -n1 || true)"
    if [[ -n "$newest" ]]; then IN="$newest"; else IN="$(stage_dir 1)/${CAPTURE_NAME}.mkv"; fi
  fi
  info "Using captured file: $IN"
  if [[ $ONLY_CAPTURE -eq 1 ]]; then info "ONLY_CAPTURE set; exiting after capture."; exit 0; fi
fi

# Require input from here if not set
if [[ -z "$IN" ]]; then
  err "No INPUT provided. Use --preview/--capture/--capture-and-preview, or pass an existing file."
  exit 1
fi
if [[ ! -f "$IN" && -f "$REPO_ROOT/../$IN" ]]; then
  IN="$(cd "$REPO_ROOT/.." && pwd -P)/$IN"
fi
[[ -f "$IN" ]] || { err "Input not found: $IN"; exit 1; }

# Heuristic for mode
HAS_AUDIO=$(ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "$IN" || true)
if [[ "$MODE" == "guess" ]]; then
  if [[ -z "$HAS_AUDIO" ]]; then MODE="cine18"; info "Heuristic: no audio -> CINE 18fps"
  else MODE="vhs"; info "Heuristic: audio present -> VHS"; fi
fi
CURRENT="$IN"

# ── Single-pass pre-deinterlace restoration ────────────────────────────────
# Compõe expcol + denoise + chroma em UM único passo ffmpeg → zero I/O intermediário.
# Cada filtro habilitado é encadeado com vírgula antes de ser passado ao ffmpeg.
# shellcheck source=/dev/null
source "$REPO_ROOT/lib/filters.sh"

# Rastreia todos os intermediários para limpeza opcional ao final
WORK_FILES=()

PREDEINT_VF="$(build_predeint_filters "$APPLY_EXPCOL" "$APPLY_DENOISE" "$APPLY_CHROMA")"

if [[ -n "$PREDEINT_VF" ]]; then
  info "Step: pré-deinterlace (single-pass: ${PREDEINT_VF})"
  PRE_OUT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_pre.mkv"
  run_ffmpeg "${PRE_OUT%.*}.log" -hide_banner -i "$CURRENT" \
    -vf "$PREDEINT_VF" \
    "${ffv1_args[@]}" "$PRE_OUT"
  CURRENT="$PRE_OUT"
  validate_video "$CURRENT" "pré-deinterlace"
  WORK_FILES+=("$CURRENT")
fi

# Deinterlace
if [[ "$DEINT" == "qtgmc" ]]; then
  info "Step: QTGMC deinterlace to 50p (${FIELD})"
  "$REPO_ROOT/stages/3_motion_and_fps_correction/00_qtgmc_deint.sh" "$CURRENT" "$(stage_dir 3)" "$FIELD"
  CURRENT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_qtgmc50p.mkv"
else
  info "Step: bwdif deinterlace to 50p"
  "$REPO_ROOT/stages/3_motion_and_fps_correction/01_deinterlace_bwdif.sh" "$CURRENT" "$(stage_dir 3)"
  CURRENT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_bwdif.mkv"
fi
validate_video "$CURRENT" "deinterlace"
WORK_FILES+=("$CURRENT")

# Trim black frames AFTER deinterlace (progressive 50p) — eliminates jumps at splice points.
# MUST run before vidstab so the stabiliser never tries to track across edit boundaries.
#
# --mode=auto:
#   - Gaps intermediários (dropouts, falhas de sinal): remove do VÍDEO APENAS.
#     O áudio continua 100% intacto e contínuo — isso corrige a dessincronização
#     progressiva causada pelos frames extras inseridos pela capturadora.
#   - Líder inicial / trailer final: remove de ambos os streams (A/V sync),
#     pois não há conteúdo útil em nenhum dos dois.
if [[ $TRIM_BLACK -eq 1 ]]; then
  info "Step: trim black frames (video-only para gaps, A/V sync para líder/trailer)"
  TRIM_OUT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_trimmed.mkv"
  python "$REPO_ROOT/stages/2_restoration/00_trim_black_sync.py" \
    --mode=auto \
    "$CURRENT" "$TRIM_OUT"
  CURRENT="$TRIM_OUT"
  validate_video "$CURRENT" "trim_black"
  WORK_FILES+=("$CURRENT")
fi

# Stabilise
info "Step: stabilise (detect)"
"$REPO_ROOT/stages/3_motion_and_fps_correction/02_stab_detect.sh" "$CURRENT" "$(basename "${CURRENT%.*}")"
info "Step: stabilise (apply)"
"$REPO_ROOT/stages/3_motion_and_fps_correction/03_stab_apply.sh" "$CURRENT" "$(stage_dir 3)/$(basename "${CURRENT%.*}").trf" "$(stage_dir 3)"
CURRENT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_stab.mkv"
validate_video "$CURRENT" "vidstab"
WORK_FILES+=("$CURRENT")

# Mode-specific timing/interp
case "$MODE" in
  cine18)
    info "Step: conform to 18fps"
    "$REPO_ROOT/stages/3_motion_and_fps_correction/04_conform_18fps.sh" "$CURRENT" "$(stage_dir 3)"
    CURRENT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_18fps.mkv"
    validate_video "$CURRENT" "conform_18fps"
    WORK_FILES+=("$CURRENT")
    info "Step: motion interpolate to 50p"
    "$REPO_ROOT/stages/3_motion_and_fps_correction/06_minterp_50p.sh" "$CURRENT" "$(stage_dir 4)"
    CURRENT="$(stage_dir 4)/$(basename "${CURRENT%.*}")_50p.mkv"
    validate_video "$CURRENT" "minterp_50p"
    WORK_FILES+=("$CURRENT")
    ;;
  cine24)
    info "Step: conform to 24fps"
    "$REPO_ROOT/stages/3_motion_and_fps_correction/05_conform_24fps.sh" "$CURRENT" "$(stage_dir 3)"
    CURRENT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_24fps.mkv"
    validate_video "$CURRENT" "conform_24fps"
    WORK_FILES+=("$CURRENT")
    info "Step: motion interpolate to 50p"
    "$REPO_ROOT/stages/3_motion_and_fps_correction/06_minterp_50p.sh" "$CURRENT" "$(stage_dir 4)"
    CURRENT="$(stage_dir 4)/$(basename "${CURRENT%.*}")_50p.mkv"
    validate_video "$CURRENT" "minterp_50p"
    WORK_FILES+=("$CURRENT")
    ;;
  vhs)
    # VHS deinterlaced via bwdif ou QTGMC já é double-rate (50p).
    # Pular minterpolate evita optical flow redundante — ~10-20x mais rápido.
    info "Step: VHS cadence verified at 50/60p (skipping redundant minterpolate)"
    ;;
esac

# Accelerated single-pass SAR + 1080p Upscale + Final Encode
info "Step: single-pass upscale & encode to 1080p master (zero intermediate disk I/O)"
FINAL_DIR="$(stage_dir 5)"
mkdir -p "$FINAL_DIR"

# Build final video filter chain using filters.sh library
VFILTER="$(build_final_filters "$FILL16X9" "$APPLY_SHARP")"

if [[ "$FINAL" == "prores" ]]; then
  FINAL_OUT="$FINAL_DIR/$(basename "${CURRENT%.*}")_1080p_prores.mov"
  info "Encoding ProRes 422 HQ: $FINAL_OUT"
  run_ffmpeg "${FINAL_OUT%.*}.log" -hide_banner -y -i "$CURRENT" \
    -vf "$VFILTER" \
    -c:v prores_ks -profile:v 3 -vendor apl0 -bits_per_mb 8000 -pix_fmt yuv422p10le \
    -c:a copy "$FINAL_OUT"
else
  FINAL_OUT="$FINAL_DIR/$(basename "${CURRENT%.*}")_1080p_h264.mp4"
  info "Encoding H.264 (CRF=$CRF, preset=slow): $FINAL_OUT"
  run_ffmpeg "${FINAL_OUT%.*}.log" -hide_banner -y -i "$CURRENT" \
    -vf "$VFILTER" \
    -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -color_primaries bt470bg -color_trc bt470bg -colorspace bt470bg \
    -c:a aac -b:a 192k "$FINAL_OUT"
fi

validate_video "$FINAL_OUT" "encode final"

# ── Limpeza de intermediários (--clean-work) ────────────────────────────────
if [[ $CLEAN_WORK -eq 1 ]]; then
  info "Removendo arquivos intermediários (--clean-work)..."
  cleanup_work "${WORK_FILES[@]}"
  # Remove também TRF de vidstab
  find "$(stage_dir 3)" -name "*.trf" -delete 2>/dev/null || true
  info "Limpeza concluída."
fi

# ── Resumo final ─────────────────────────────────────────────────────────────
info "══════════════════════════════════════════"
info "Concluído! Master restaurado:"
info "  $FINAL_OUT"
info "══════════════════════════════════════════"

