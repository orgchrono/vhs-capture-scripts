#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SELF_DIR/../.." && pwd -P)}"
export REPO_ROOT
source "$REPO_ROOT/lib/video-lib.sh"

usage() {
  cat <<'EOF'
INFO — 00_live_capture.sh

Capture lossless FFV1/PCM MKV de v4l2 + ALSA. Campos entrelaçados preservados (yuv422p).

USAGE
  ./00_live_capture.sh [BaseName] [--help]
  DEV_VIDEO=/dev/video2 ALSA_DEV=hw:1,0 AUDIO_RATE=96000 ./00_live_capture.sh "TapeA"
  LIMIT="01:30:00" SPLIT_MIN=20 ./00_live_capture.sh "TapeA"

ENV VARS
  DEV_VIDEO    Dispositivo V4L2    (padrão: /dev/video2)
  ALSA_DEV     Dispositivo ALSA   (padrão: hw:1,0)
  FRAMERATE    FPS                (padrão: 25)
  VIDEO_SIZE   Resolução          (padrão: 720x576)
  INPUT_FMT    Formato V4L2       (padrão: yuyv422)
  AUDIO_RATE   Taxa de amostragem (padrão: 48000; recomendado: 96000)
  LIMIT        Duração máxima     (ex: 01:30:00)
  SPLIT_MIN    Segmentar em N min (ex: 20)
  OUTDIR       Diretório de saída (padrão: stage_dir 1)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -n "${HELP:-}" ]]; then
  usage; exit 0
fi

DEV_VIDEO="${DEV_VIDEO:-/dev/video2}"
ALSA_DEV="${ALSA_DEV:-hw:1,0}"
FRAMERATE="${FRAMERATE:-25}"
VIDEO_SIZE="${VIDEO_SIZE:-720x576}"
INPUT_FMT="${INPUT_FMT:-yuyv422}"
AUDIO_RATE="${AUDIO_RATE:-48000}"
LIMIT="${LIMIT:-}"
SPLIT_MIN="${SPLIT_MIN:-}"
OUTDIR="${OUTDIR:-$(stage_dir 1)}"

[[ -e "$DEV_VIDEO" ]] || { err "Video device not found: $DEV_VIDEO"; exit 1; }
[[ -n "${ALSA_DEV:-}" ]] || warn "ALSA_DEV unset; capturing without audio"
df -P "$OUTDIR" | awk 'NR==2{if($4<1024*1024) exit 1}' || warn "Less than ~1GB free in $OUTDIR"
mkdir -p "$OUTDIR"

ts="$(date +'%Y-%m-%d_%H%M%S')"
base="${1:-capture_$ts}"
outfile="$OUTDIR/$base.mkv"
logfile="${outfile%.mkv}.log"

info "Capturing to $outfile"
info "Source: $DEV_VIDEO ($INPUT_FMT, $VIDEO_SIZE@${FRAMERATE}fps) | $ALSA_DEV (${AUDIO_RATE}Hz)"

in_video=( -f v4l2 -thread_queue_size 4096 -input_format "$INPUT_FMT" -framerate "$FRAMERATE" -video_size "$VIDEO_SIZE" -i "$DEV_VIDEO" )
in_audio=( -f alsa -thread_queue_size 4096 -channels 2 -sample_rate "$AUDIO_RATE" -i "$ALSA_DEV" )

enc=( -map 0:v:0 -map 1:a:0
      -c:v ffv1 -level 3 -g 1 -slices 24 -slicecrc 1 -pix_fmt yuv422p
      -c:a pcm_s16le
      -af aresample=async=1:first_pts=0 )

dur=()
[[ -n "$LIMIT" ]] && dur=( -t "$LIMIT" )

if [[ -n "$SPLIT_MIN" ]]; then
  seg_secs=$(( SPLIT_MIN * 60 ))
  cmd=( ffmpeg -hide_banner "${in_video[@]}" "${in_audio[@]}" \
        "${enc[@]}" \
        -f segment -segment_time "$seg_secs" -reset_timestamps 1 \
        -strftime 1 "$OUTDIR/${base}_%Y-%m-%d_%H%M%S.mkv" )
else
  cmd=( ffmpeg -hide_banner "${in_video[@]}" "${in_audio[@]}" "${enc[@]}" "${dur[@]}" "$outfile" )
fi

{ echo "----- $(date -Iseconds)"; printf '%q ' "${cmd[@]}"; echo; } >> "$logfile"
"${cmd[@]}" 2>&1 | tee -a "$logfile"
info "Capture complete. Saved: $outfile"
