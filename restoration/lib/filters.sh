#!/usr/bin/env bash
# lib/filters.sh — Biblioteca de filtros ffmpeg compostos para VHS restoration
# Inclua com: source "$REPO_ROOT/lib/filters.sh"
#
# Funções retornam strings de filtro prontas para uso em -vf ou -filter_complex.
# Todas aceitam variáveis de ambiente como override dos defaults.

# ---------------------------------------------------------------------------
# Filtros de restauração (operam melhor sobre vídeo entrelaçado)
# ---------------------------------------------------------------------------

# Exposure + color balance (defaults neutros: 0 alteração sem parâmetros explícitos)
# Env: BRIGHT CONTRAST SAT GAMMA CB_RS CB_BS
filter_expcol() {
  local bright="${BRIGHT:-0.00}"
  local contrast="${CONTRAST:-1.00}"
  local sat="${SAT:-1.00}"
  local gamma="${GAMMA:-1.00}"
  local cb_rs="${CB_RS:-0.0}"
  local cb_bs="${CB_BS:-0.0}"
  echo "eq=brightness=${bright}:contrast=${contrast}:saturation=${sat}:gamma=${gamma},colorbalance=rs=${cb_rs}:bs=${cb_bs}"
}

# Spatial + temporal denoise (hqdn3d)
# Env: LUMA CHROMA TL TC
filter_denoise() {
  local luma="${LUMA:-1.5}"
  local chroma="${CHROMA:-1.5}"
  local tl="${TL:-6}"
  local tc="${TC:-6}"
  echo "hqdn3d=${luma}:${chroma}:${tl}:${tc}"
}

# Chroma misalignment correction (FFmpeg chromashift filter)
# Env: CHROMA_W CHROMA_H
filter_chroma_shift() {
  local w="${CHROMA_W:-2}"
  local h="${CHROMA_H:-1}"
  echo "chromashift=cbh=${w}:cbv=${h}:crh=${w}:crv=${h}:edge=smear"
}

# ---------------------------------------------------------------------------
# Filtros de geometria e upscale / framing (operam sobre vídeo progressivo)
# ---------------------------------------------------------------------------

# Crop de VBI (remove 6 linhas de intervalo vertical da Blackmagic 486 -> 480 ativas)
filter_vbi_crop() {
  echo "crop=720:480:0:4"
}

# 4:3 pillarbox → 1440x1080 com conversão de espaço de cores BT.601 -> BT.709 + pad a 1920x1080
filter_upscale_4x3() {
  local in_matrix="${IN_COLOR_MATRIX:-smpte170m}"
  echo "setsar=1,scale=1440:1080:flags=lanczos:in_color_matrix=${in_matrix}:out_color_matrix=bt709,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
}

# Fill 16:9 (crop mínimo, sem stretch) com conversão BT.601 -> BT.709
filter_upscale_fill16x9() {
  local in_matrix="${IN_COLOR_MATRIX:-smpte170m}"
  echo "setsar=1,scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase:in_color_matrix=${in_matrix}:out_color_matrix=bt709,crop=1920:1080"
}

# Unsharp mask (sharpen pós-upscale)
# Env: SHARP_L SHARP_C SHARP_A
filter_unsharp() {
  local l="${SHARP_L:-5}"
  local c="${SHARP_C:-5}"
  local a="${SHARP_A:-0.5}"
  echo "unsharp=${l}:${c}:${a}"
}

# bwdif deinterlace para 50p
# Env: BWDIF_MODE BWDIF_PARITY BWDIF_DEINT
filter_bwdif() {
  local mode="${BWDIF_MODE:-1}"
  local parity="${BWDIF_PARITY:-auto}"
  local deint="${BWDIF_DEINT:-all}"
  echo "bwdif=mode=${mode}:parity=${parity}:deint=${deint}"
}

# ---------------------------------------------------------------------------
# Construtor de filter chain composto (pré-deinterlace, vídeo entrelaçado)
# Retorna uma string de filtros encadeados, pulando os desabilitados.
# Uso: vf="$(build_predeint_filters 1 1 1)"  # expcol=1 denoise=1 chroma=1
# ---------------------------------------------------------------------------
build_predeint_filters() {
  local apply_expcol="${1:-0}"
  local apply_denoise="${2:-0}"
  local apply_chroma="${3:-0}"
  local parts=()

  [[ "$apply_expcol"  -eq 1 ]] && parts+=("$(filter_expcol)")
  [[ "$apply_denoise" -eq 1 ]] && parts+=("$(filter_denoise)")
  [[ "$apply_chroma"  -eq 1 ]] && parts+=("$(filter_chroma_shift)")

  local IFS=","
  echo "${parts[*]}"
}

# ---------------------------------------------------------------------------
# Construtor de filter chain composto (pós-deinterlace, vídeo progressivo)
# Retorna filtros de upscale + sharpen para o passo final de encode.
# Uso: vf="$(build_final_filters 0 1)"  # fill16x9=0 sharpen=1
# ---------------------------------------------------------------------------
build_final_filters() {
  local fill16x9="${1:-0}"
  local apply_sharp="${2:-0}"
  local crop_vbi="${3:-0}"
  local parts=()

  [[ "$crop_vbi" -eq 1 ]] && parts+=("$(filter_vbi_crop)")

  if [[ "$fill16x9" -eq 1 ]]; then
    parts+=("$(filter_upscale_fill16x9)")
  else
    parts+=("$(filter_upscale_4x3)")
  fi

  [[ "$apply_sharp" -eq 1 ]] && parts+=("$(filter_unsharp)")

  local IFS=","
  echo "${parts[*]}"
}
