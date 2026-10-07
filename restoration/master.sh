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
for cmd in ffmpeg ffprobe python; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing dependency: $cmd" >&2; exit 1; }
done

# shellcheck source=/dev/null
source "$REPO_ROOT/lib/video-lib.sh"
# shellcheck source=/dev/null
source "$REPO_ROOT/lib/filters.sh"

# Helper para converter caminhos POSIX em caminhos Windows para o Python nativo
to_win_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    echo "$1"
  fi
}

cd "$REPO_ROOT"

usage() {
  cat <<'EOF'
Usage:
  master.sh INPUT.mkv [pipeline options]
  master.sh --preview [device options]
  master.sh --capture[=NAME] [device options] [--limit HH:MM:SS] [--split-min N] [pipeline options]
  master.sh --capture-and-preview[=NAME] [device options] [--limit HH:MM:SS] [pipeline options]

Modes:
  --vhs                 Treat as interlaced VHS (preflight->black-hold->deint->restore->upscale)
  --cine18              Cine @ 18 fps (conform->50p)
  --cine24              Cine @ 24 fps (conform->50p)
  --guess               Heuristic (default): no audio => cine18, else VHS
  --fast                Fast direct streaming restore via Python QuickSync/x264

Hardware & Standards:
  --device=NAME         Device profile: jvc_gr_ax410 (mono) | jvc_hr_d227m (stereo)
  --standard=STD        Standard override: ntsc | pal | auto

Deinterlace:
  --bwdif               Use ffmpeg bwdif (default, ultra-fast bob 60p/50p)
  --qtgmc[=TFF|BFF|AUTO] Use VapourSynth QTGMC (best motion quality, requires vspipe)

Enhancements:
  --trim-black          Neutralize black gaps and freeze middle dropouts (TBC frame-hold)
  --blackmagic          Optimizations for Blackmagic Intensity Shuttle captures
  --expcol              Exposure/colour adjustments (eq + colorbalance)
  --denoise             Light hqdn3d denoise
  --chroma-fix          Correct chroma bleed/shift (chromashift filter)
  --sharpen             Gentle unsharp after upscale

Framing & delivery:
  --fill16x9            Crop/scale to fill 16:9 (default is 4:3 pillarbox)
  --prores              Final encode as ProRes MOV (default H.264 MP4 Rec.709)
  --crf N               CRF for H.264 (default 18)
  --clean-work          Remove intermediate work files after successful final encode
  -y                    Allow overwriting output files
  -h|--help             Show help and exit
EOF
}

# Defaults
IN=""
MODE="guess"
DEINT="bwdif"
FIELD="AUTO"
TRIM_BLACK=0
APPLY_DENOISE=0
APPLY_CHROMA=0
APPLY_EXPCOL=0
APPLY_SHARP=0
APPLY_STAB=""
FILL16X9=0
FINAL="h264"
CRF=18
FFMPEG_Y=""
DO_PREVIEW=0
DO_CAPTURE=0
DO_CAP_PREVIEW=0
CAPTURE_NAME=""
ONLY_CAPTURE=0
FAST_MODE=0
DEVICE_ID="auto"
STANDARD_OVERRIDE="auto"
CLEAN_WORK=0
BLACKMAGIC=0

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --preview) DO_PREVIEW=1;;
    --capture) DO_CAPTURE=1;;
    --capture=*) DO_CAPTURE=1; CAPTURE_NAME="${1#--capture=}";;
    --capture-and-preview) DO_CAP_PREVIEW=1;;
    --capture-and-preview=*) DO_CAP_PREVIEW=1; CAPTURE_NAME="${1#--capture-and-preview=}";;
    --only-capture) ONLY_CAPTURE=1;;
    --fast) FAST_MODE=1;;
    --device) shift; DEVICE_ID="${1:?value}";;
    --device=*) DEVICE_ID="${1#--device=}";;
    --standard) shift; STANDARD_OVERRIDE="${1:?value}";;
    --standard=*) STANDARD_OVERRIDE="${1#--standard=}";;
    --cine18) MODE="cine18";;
    --cine24) MODE="cine24";;
    --vhs) MODE="vhs";;
    --guess) MODE="guess";;
    --qtgmc) DEINT="qtgmc"; FIELD="AUTO";;
    --qtgmc=*) DEINT="qtgmc"; FIELD="${1#--qtgmc=}";;
    --bwdif) DEINT="bwdif";;
    --trim-black|--remove-black) TRIM_BLACK=1;;
    --blackmagic) BLACKMAGIC=1; TRIM_BLACK=1;;
    --denoise) APPLY_DENOISE=1;;
    --chroma-fix) APPLY_CHROMA=1;;
    --expcol) APPLY_EXPCOL=1;;
    --sharpen) APPLY_SHARP=1;;
    --stab) APPLY_STAB=1;;
    --no-stab) APPLY_STAB=0;;
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

# Require input file
if [[ -z "$IN" ]]; then
  err "Nenhum arquivo de entrada fornecido. Use --help para instruções."
  exit 1
fi
if [[ ! -f "$IN" && -f "$REPO_ROOT/../$IN" ]]; then
  IN="$(cd "$REPO_ROOT/.." && pwd -P)/$IN"
fi
[[ -f "$IN" ]] || { err "Arquivo de entrada não encontrado: $IN"; exit 1; }

# Fast streaming mode dispatch
if [[ $FAST_MODE -eq 1 ]]; then
  info "Executando em modo Fast Streaming direto (via direct_restore.py)..."
  FAST_ARGS=("$IN" "--crf" "$CRF")
  [[ $APPLY_DENOISE -eq 1 ]] && FAST_ARGS+=("--denoise")
  [[ $APPLY_CHROMA -eq 1 ]]  && FAST_ARGS+=("--chroma-fix")
  python "$REPO_ROOT/direct_restore.py" "${FAST_ARGS[@]}"
  exit $?
fi

WORK_DIR="$(cd "$REPO_ROOT/.." && pwd -P)/media/work"
mkdir -p "$WORK_DIR"
MANIFEST_FILE="$WORK_DIR/manifest.json"

# ===========================================================================
# ESTÁGIO 0: PREFLIGHT E MANIFESTO TÉCNICO
# ===========================================================================
info "Executando Estágio 0: Preflight..."

if command -v cygpath >/dev/null 2>&1; then
  MANIFEST_FILE_PY="$(cygpath -w "$MANIFEST_FILE")"
else
  MANIFEST_FILE_PY="$MANIFEST_FILE"
fi

python "$REPO_ROOT/stages/0_preflight/00_preflight.py" "$(to_win_path "$IN")" \
  -o "$MANIFEST_FILE_PY" \
  --device "$DEVICE_ID" \
  --standard "$STANDARD_OVERRIDE"

# Leitura determinística de propriedades do manifesto
STANDARD=$(python -c "import json; m=json.load(open(r'$MANIFEST_FILE_PY')); print(m.get('standard','ntsc'))")
NEEDS_DEINT=$(python -c "import json; m=json.load(open(r'$MANIFEST_FILE_PY')); print('1' if m.get('needs_deinterlace') else '0')")
PREF_ORDER=$(python -c "import json; m=json.load(open(r'$MANIFEST_FILE_PY')); print(m.get('field_order','bff').upper())")
NEEDS_CROP=$(python -c "import json; m=json.load(open(r'$MANIFEST_FILE_PY')); print('1' if m.get('needs_vbi_crop') else '0')")
AUDIO_POLICY=$(python -c "import json; m=json.load(open(r'$MANIFEST_FILE_PY')); print(m.get('audio_policy','stereo_passthrough'))")
IN_COLOR_MATRIX=$(python -c "import json; m=json.load(open(r'$MANIFEST_FILE_PY')); print(m.get('color_in','smpte170m'))")
export IN_COLOR_MATRIX

CURRENT="$IN"
WORK_FILES=()

# ===========================================================================
# ESTÁGIO 2: TRATAMENTO DE SINAL & SINCRONIA A/V (TBC FRAME-HOLD)
# Executado ANTES do deinterlace para não perder tempo com pretos
# ===========================================================================
if [[ $TRIM_BLACK -eq 1 ]]; then
  info "Executando Estágio 2: Neutralização de perdas de sinal (TBC Frame-Hold)..."
  STAGE2_DIR="$(stage_dir 2)"
  HOLD_OUT="$STAGE2_DIR/$(basename "${CURRENT%.*}")_held.mkv"
  if [[ -f "$HOLD_OUT" && "${OVERWRITE:-0}" != "1" ]]; then
    info "Etapa de neutralização já processada. Reutilizando: $HOLD_OUT"
    CURRENT="$HOLD_OUT"
  else
    python "$REPO_ROOT/stages/2_restoration/00_black_hold.py" "$(to_win_path "$CURRENT")" -o "$(to_win_path "$HOLD_OUT")" --mode freeze
    CURRENT="$HOLD_OUT"
  fi
  validate_video "$CURRENT" "black_hold"
  WORK_FILES+=("$CURRENT")
fi

# ===========================================================================
# ESTÁGIO 3: DESENTRELAÇAMENTO INTELIGENTE
# Pula se o vídeo já estiver progressivo conforme o manifesto
# ===========================================================================
if [[ "$NEEDS_DEINT" -eq 1 ]]; then
  STAGE3_DIR="$(stage_dir 3)"
  if [[ "$DEINT" == "qtgmc" ]] && command -v vspipe >/dev/null 2>&1; then
    DEINT_OUT="$STAGE3_DIR/$(basename "${CURRENT%.*}")_qtgmc.mkv"
    info "Executando Estágio 3: QTGMC Deinterlace (${PREF_ORDER})..."
    "$REPO_ROOT/stages/3_motion_and_fps_correction/00_qtgmc_deint.sh" "$CURRENT" "$STAGE3_DIR" "$PREF_ORDER"
    CURRENT="$DEINT_OUT"
  else
    DEINT_OUT="$STAGE3_DIR/$(basename "${CURRENT%.*}")_bwdif.mkv"
    info "Executando Estágio 3: BWDIF Bob Deinterlace 60p/50p..."
    "$REPO_ROOT/stages/3_motion_and_fps_correction/01_deinterlace_bwdif.sh" "$CURRENT" "$STAGE3_DIR"
    CURRENT="$DEINT_OUT"
  fi
  validate_video "$CURRENT" "deinterlace"
  WORK_FILES+=("$CURRENT")
else
  info "Estágio 3: Vídeo já progressivo (detectado no preflight). Pulando desentrelaçamento."
fi

# ===========================================================================
# ESTÁGIO 4: FILTROS DE RESTAURAÇÃO (SINGLE-PASS LOSSLESS)
# Expcol + Denoise + ChromaShift combinados
# ===========================================================================
RESTORE_VF="$(build_predeint_filters "$APPLY_EXPCOL" "$APPLY_DENOISE" "$APPLY_CHROMA")"
if [[ -n "$RESTORE_VF" ]]; then
  info "Executando Estágio 4: Filtros de restauração (${RESTORE_VF})..."
  STAGE4_DIR="$(stage_dir 4)"
  RESTORE_OUT="$STAGE4_DIR/$(basename "${CURRENT%.*}")_restored.mkv"
  run_ffmpeg "${RESTORE_OUT%.*}.log" -hide_banner -i "$CURRENT" \
    -vf "$RESTORE_VF" \
    "${ffv1_args[@]}" "$RESTORE_OUT"
  CURRENT="$RESTORE_OUT"
  validate_video "$CURRENT" "restauração"
  WORK_FILES+=("$CURRENT")
fi

# Estabilização (opcional)
if [[ "${APPLY_STAB:-0}" -eq 1 ]]; then
  info "Executando estabilização vidstab..."
  "$REPO_ROOT/stages/3_motion_and_fps_correction/02_stab_detect.sh" "$CURRENT" "$(basename "${CURRENT%.*}")"
  "$REPO_ROOT/stages/3_motion_and_fps_correction/03_stab_apply.sh" "$CURRENT" "$(stage_dir 3)/$(basename "${CURRENT%.*}").trf" "$(stage_dir 3)"
  CURRENT="$(stage_dir 3)/$(basename "${CURRENT%.*}")_stab.mkv"
  validate_video "$CURRENT" "vidstab"
  WORK_FILES+=("$CURRENT")
fi

# ===========================================================================
# ESTÁGIO 5: GEOMETRIA, UPSCALE 1080P & CODIFICAÇÃO FINAL
# Crop VBI (se 486) + Rec.709 Master Encoding
# ===========================================================================
info "Executando Estágio 5: Upscale 1080p Lanczos e Codificação Final Rec.709..."
FINAL_DIR="$(stage_dir 5)"
mkdir -p "$FINAL_DIR"

VFILTER="$(build_final_filters "$FILL16X9" "$APPLY_SHARP" "$NEEDS_CROP")"

# Configuração de áudio (duplicação mono se solicitado pelo perfil do aparelho)
AUDIO_OPTS=(-c:a aac -b:a 192k)
if [[ "$AUDIO_POLICY" == "duplicate_mono_to_stereo" ]]; then
  AUDIO_OPTS=(-af "pan=stereo|c0=c0|c1=c0" -c:a aac -b:a 192k)
fi

if [[ "$FINAL" == "prores" ]]; then
  FINAL_OUT="$FINAL_DIR/$(basename "${CURRENT%.*}")_1080p_prores.mov"
  info "Codificando Apple ProRes 422 HQ: $FINAL_OUT"
  run_ffmpeg "${FINAL_OUT%.*}.log" -hide_banner -y -i "$CURRENT" \
    -vf "$VFILTER" \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    -c:v prores_ks -profile:v 3 -vendor apl0 -bits_per_mb 8000 -pix_fmt yuv422p10le \
    "${AUDIO_OPTS[@]}" "$FINAL_OUT"
else
  FINAL_OUT="$FINAL_DIR/$(basename "${CURRENT%.*}")_1080p_master.mp4"
  info "Codificando H.264 Master (CRF=$CRF, Rec.709): $FINAL_OUT"
  run_ffmpeg "${FINAL_OUT%.*}.log" -hide_banner -y -i "$CURRENT" \
    -vf "$VFILTER" \
    -c:v libx264 -preset veryfast -crf "$CRF" -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    "${AUDIO_OPTS[@]}" "$FINAL_OUT"
fi

validate_video "$FINAL_OUT" "encode final"

# ===========================================================================
# ESTÁGIO 6: VERIFICAÇÃO DE CONFORMIDADE
# ===========================================================================
info "Executando Estágio 6: Verificação de Conformidade..."
python "$REPO_ROOT/stages/6_verify/verify.py" "$(to_win_path "$FINAL_OUT")"

# Limpeza de intermediários (--clean-work)
if [[ $CLEAN_WORK -eq 1 ]]; then
  info "Removendo intermediários (--clean-work)..."
  cleanup_work "${WORK_FILES[@]}"
fi

info "════════════════════════════════════════════════════════════"
info "SUCESSO: Processo concluído com êxito!"
info "Arquivo Master Final: $FINAL_OUT"
info "════════════════════════════════════════════════════════════"
