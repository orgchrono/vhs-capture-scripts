"""VHS and analog media quality control, signal diagnostics, and archival defect reporting.

Implements a closure-first architecture (FP Core / Imperative Shell) that documents
every technical defect (signal loss, analog RF/audio noise, top-of-frame flagging,
horizontal time-base jitter, luminance/chrominance excursions, blown-out colors,
magnetic oxide dropouts, head-switching noise, combing) and every per-tool pipeline
correction in real time, synchronized atomically with frame checkpoints for seamless
interruption and resumption compliance (IASA-TC 04 / FADGI / CONARQ / PREMIS).
"""

import copy
import datetime
import json
import os
import re
import subprocess
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

from vhs_studio.core import vhs_common
from vhs_studio.core.constants import (
    ANALOG_NOISE_VARIANCE_THRESHOLD,
    ARCHIVAL_STANDARD_COMPLIANCE,
    AUDIO_NOTCH_ATTENUATION_DB,
    AUDIO_NOTCH_HUM_FREQ_HZ,
    BLACK_CRUSH_RATIO_THRESHOLD,
    BLOWN_OUT_CHROMA_RATIO_THRESHOLD,
    BT601_CHROMA_MAX_LEGAL,
    BT601_CHROMA_MIN_LEGAL,
    BT601_CHROMA_NEUTRAL,
    BT601_LUMA_MAX_LEGAL,
    BT601_LUMA_MIN_LEGAL,
    CLIPPED_LUMA_RATIO_THRESHOLD,
    DEFAULT_AUDIO_DENOISE_NF_DB,
    DEFAULT_AUDIO_DENOISE_NR_DB,
    DEFAULT_CODEFORMER_FIDELITY,
    DEFAULT_CRF,
    DEFAULT_DROPOUT_LINE_RATIO,
    DEFAULT_DROPOUT_LUMA_THRESHOLD,
    DEFAULT_LUMA_THRESHOLD,
    DEFAULT_NTSC_FPS,
    DEFAULT_RIFE_MODEL,
    DEFAULT_RIFE_TARGET_FPS,
    DEFAULT_SCENE_THRESHOLD,
    DEFAULT_UPSCALER_MODEL,
    FLAGGING_SKEW_THRESHOLD,
    FLAGGING_TOP_SCANLINES,
    HEAD_SWITCHING_NOISE_THRESHOLD,
    JITTER_DELTA_THRESHOLD,
    MAX_DEFECT_EVENTS_LOG,
    MAX_LEGAL_CHROMA_SATURATION,
    NTSC_HEIGHT,
    NTSC_WIDTH,
    OVERSCAN_BLANKING_HEIGHT_PX,
    PAL_HEIGHT,
)
from vhs_studio.core.logger import log
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.video.dropout_cleaner import DropoutCleaner


def sec_to_timecode(seconds: float) -> str:
    """Pure function converting float seconds to HH:MM:SS.mmm broadcast timecode."""
    if seconds <= 0:
        return "00:00:00.000"
    hrs = int(seconds // 3600)
    rem = seconds % 3600
    mins = int(rem // 60)
    secs = rem % 60
    return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"


def build_pipeline_tools_registry(
    params: Optional[Mapping[str, Any]] = None,
    resolved_deint: str = "bwdif",
    audio_mode: str = "stereo",
    start_sec: float = 0.0,
    target_1080p: bool = True,
    encoder: str = "libx264",
) -> List[Dict[str, Any]]:
    """Pure functional builder returning the standardized per-tool correction registry."""
    cfg = dict(params or {})
    mode = str(cfg.get("mode", "freeze"))
    crf = int(cfg.get("crf", DEFAULT_CRF))
    codec = str(cfg.get("output_codec", "h264"))
    apply_blanking = bool(cfg.get("overscan_blanking", cfg.get("apply_overscan_blanking", True)))
    apply_dropout = bool(cfg.get("dropout_clean", cfg.get("apply_dropout_clean", True)))
    apply_comb = bool(cfg.get("comb_filter", cfg.get("apply_comb_filter", False)))
    apply_chroma = bool(cfg.get("chroma_fix", cfg.get("apply_chroma", True)))
    apply_denoise = bool(cfg.get("denoise", cfg.get("apply_denoise", True)))
    apply_audio_treat = bool(cfg.get("audio_treatment", cfg.get("apply_audio_treatment", True)))
    apply_ai_audio = bool(cfg.get("ai_audio_denoise", cfg.get("apply_ai_audio_denoise", False)))
    apply_face = bool(cfg.get("ai_face_restore", False))
    apply_rife = bool(cfg.get("ai_rife_60fps", False))
    apply_upscale = bool(cfg.get("ai_upscaler") or cfg.get("esrgan") or cfg.get("realcugan"))

    return [
        {
            "tool_id": "leader_trim_sync",
            "tool_name": "find_first_video_frame (Podador de Líder e Alinhador A/V)",
            "stage": "Stage 0: Diagnóstico & Alinhamento de Entrada",
            "engine": "FFmpeg Rawvideo Luma Scanner",
            "enabled": True,
            "status": "applied" if start_sec > 0.0 else "monitored",
            "parameters": {
                "trimmed_leader_sec": round(start_sec, 3),
                "luma_threshold": DEFAULT_LUMA_THRESHOLD,
            },
            "defects_targeted": [
                "Líder Inicial Vazio / Ruído Estático",
                "Dessincronia A/V de Ponto Zero",
            ],
            "correction_summary": (
                f"Poda de {start_sec:.3f}s de líder magnético sem gravação e "
                "ancoragem síncrona entre trilha de áudio e primeiro quadro útil."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "digital_tbc_frame_hold",
            "tool_name": "StreamRunner Digital TBC & Estabilizador de Sincronismo",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": f"StreamRunner ({mode})",
            "enabled": True,
            "status": "active",
            "parameters": {
                "mode": mode,
                "luma_threshold": DEFAULT_LUMA_THRESHOLD,
            },
            "defects_targeted": [
                "Queda de Portadora RF (Frames Pretos / Tela Azul)",
                "Time-Base Jitter (Flutuação Horizontal)",
                "Flagging / Distorção de Topo de Quadro",
            ],
            "correction_summary": (
                "Monitoramento contínuo de portadora com congelamento TBC Frame-Hold "
                "em quedas de sinal para manter 100% de sincronia labial e cadência constante."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "overscan_blanking_mask",
            "tool_name": "Máscara de Overscan VBI Inferior (Head Switching Blanking)",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": "FFmpeg drawbox",
            "enabled": apply_blanking,
            "status": "applied" if apply_blanking else "skipped",
            "parameters": {
                "height_px": OVERSCAN_BLANKING_HEIGHT_PX,
                "filter": (
                    f"drawbox=y=ih-{OVERSCAN_BLANKING_HEIGHT_PX}:color=black:"
                    f"width=iw:height={OVERSCAN_BLANKING_HEIGHT_PX}:t=fill"
                ),
            },
            "defects_targeted": [
                "Head Switching Noise (Ruído de Comutação de Cabeças)",
            ],
            "correction_summary": (
                f"Mascaramento não-destrutivo das {OVERSCAN_BLANKING_HEIGHT_PX} scanlines "
                "inferiores de comutação mecânica de cabeças sem alterar a proporção 4:3."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "magnetic_dropout_cleaner",
            "tool_name": "DropoutCleaner (Supressor Temporal de Perda de Óxido)",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": "FFmpeg removegrain + tmedian",
            "enabled": apply_dropout,
            "status": "applied" if apply_dropout else "skipped",
            "parameters": {
                "filter": DropoutCleaner.get_ffmpeg_filter(),
                "dropout_luma_threshold": DEFAULT_DROPOUT_LUMA_THRESHOLD,
                "line_ratio": DEFAULT_DROPOUT_LINE_RATIO,
            },
            "defects_targeted": [
                "Magnetic Oxide Dropouts (Riscos Brancos Transitórios)",
                "Ruído Impulsivo de Scanline",
            ],
            "correction_summary": (
                "Interpolação mediana temporal (raio=1) e espacial para substituir "
                "riscos horizontais brancos de 1 frame sem borrar objetos em movimento."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "comb_filter_3d",
            "tool_name": "Filtro Comb 3D Adaptativo (Separação Y/C)",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": "FFmpeg dedot / TComb",
            "enabled": apply_comb,
            "status": "applied" if apply_comb else "skipped",
            "parameters": {"filter": "dedot=m=comb"},
            "defects_targeted": [
                "Dot Crawl (Cross-Luminance)",
                "Rainbowing (Cross-Color)",
            ],
            "correction_summary": (
                "Filtragem de artefatos de modulação cruzada entre luminância e "
                "subportadora de crominância oriundos de conexões de vídeo composto."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "chroma_phase_alignment",
            "tool_name": "Realinhador Planar de Subportadora Color-Under (ChromaShift)",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": "FFmpeg chromashift",
            "enabled": apply_chroma,
            "status": "applied" if apply_chroma else "skipped",
            "parameters": {"filter": "chromashift=cbh=-1:cbv=0:crh=-1:crv=0"},
            "defects_targeted": [
                "Chroma Bleeding & Delay (Atraso e Borramento de Croma)",
                "Vazamento de Cores Estouradas em Contornos",
            ],
            "correction_summary": (
                "Deslocamento dos planos Cb (U) e Cr (V) para corrigir o atraso de "
                "fase da subportadora heterodinada VHS (~629 kHz) sobre a luminância Y."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "spatio_temporal_denoiser",
            "tool_name": "Redutor de Ruído Espaço-Temporal 3D (HQDN3D)",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": "FFmpeg hqdn3d",
            "enabled": apply_denoise,
            "status": "applied" if apply_denoise else "skipped",
            "parameters": {"filter": "hqdn3d=3:2:6:4"},
            "defects_targeted": [
                "Ruído Analógico de RF / Granulação de Luminância (Snow)",
                "Ruído de Crominância e Flutuação de Saturação",
            ],
            "correction_summary": (
                "Atenuação espaço-temporal 3D calibrada para limpar granulação "
                "magnética de luminância e crominância preservando detalhes finos."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "deinterlacing_engine",
            "tool_name": "Motor de Desentrelaçamento e Estabilização de Campos",
            "stage": "Stage 1: Restauração Base Frame-a-Frame",
            "engine": resolved_deint.upper() if resolved_deint else "BWDIF",
            "enabled": resolved_deint != "none",
            "status": "applied" if resolved_deint != "none" else "skipped",
            "parameters": {"deinterlacer": resolved_deint},
            "defects_targeted": [
                "Combing / Artefatos de Entrelaçamento Analógico",
                "Time-Base Jitter Residual entre Campos Ímpares e Pares",
            ],
            "correction_summary": (
                f"Desentrelaçamento progressivo via {resolved_deint.upper()} para "
                "eliminar serrilhado de campos (TFF/BFF) e estabilizar linhas horizontais."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "colorimetry_geometry_standardizer",
            "tool_name": "Padronizador Geométrico 4:3 e Colorimétrico ITU-R BT.709",
            "stage": "Stage 1: Masterização de Vídeo",
            "engine": f"FFmpeg Lanczos + {encoder} ({codec})",
            "enabled": True,
            "status": "applied",
            "parameters": {
                "target_1080p": target_1080p,
                "output_codec": codec,
                "encoder": encoder,
                "crf": crf,
                "color_space": "bt709",
                "legal_luma_range": f"{BT601_LUMA_MIN_LEGAL}-{BT601_LUMA_MAX_LEGAL}",
                "legal_chroma_range": f"{BT601_CHROMA_MIN_LEGAL}-{BT601_CHROMA_MAX_LEGAL}",
            },
            "defects_targeted": [
                "Resolução de Captura Assimétrica",
                "Excursão de Luminância / Crominância (Black Crush & White Clipping)",
                "Cores Estouradas / Saturação Fora do Gamut Broadcast",
            ],
            "correction_summary": (
                "Normalização geométrica 4:3 (Pillarbox Lanczos), mapeamento para "
                "espaço de cor ITU-R BT.709 e contenção de níveis de luminância/crominância."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "audio_conditioning_dsp",
            "tool_name": "Condicionador Acústico, Notch 60Hz e Supressor Espectral FFT",
            "stage": "Stage 2: Restauração Sonora",
            "engine": "FFmpeg pan + dcshift + anequalizer + afftdn",
            "enabled": bool(apply_audio_treat or apply_ai_audio or audio_mode != "stereo"),
            "status": (
                "applied"
                if (apply_audio_treat or apply_ai_audio or audio_mode != "stereo")
                else "monitored"
            ),
            "parameters": {
                "audio_mode": audio_mode,
                "notch_hum_hz": AUDIO_NOTCH_HUM_FREQ_HZ,
                "notch_attenuation_db": AUDIO_NOTCH_ATTENUATION_DB,
                "afftdn_nr_db": DEFAULT_AUDIO_DENOISE_NR_DB if apply_ai_audio else 0.0,
                "afftdn_nf_db": DEFAULT_AUDIO_DENOISE_NF_DB if apply_ai_audio else 0.0,
            },
            "defects_targeted": [
                "Assimetria Severa de Canais de Áudio (Canal Mudo)",
                "Hum Elétrico de Rede (60Hz) & DC Offset",
                "Chiado Magnético Linear (Tape Hiss)",
            ],
            "correction_summary": (
                f"Política de canais '{audio_mode}', remoção de DC offset, filtro notch "
                f"{AUDIO_NOTCH_HUM_FREQ_HZ}Hz ({AUDIO_NOTCH_ATTENUATION_DB} dB) e redução espectral de hiss."
            ),
            "frames_affected": 0,
        },
        {
            "tool_id": "ai_face_restoration",
            "tool_name": "CodeFormer (Restauração Facial Neural)",
            "stage": "Stage 3: Pós-Processamento Neural (DAG Sequencial)",
            "engine": "CodeFormer PyTorch/NCNN",
            "enabled": apply_face,
            "status": "pending" if apply_face else "skipped",
            "parameters": {
                "fidelity_weight": float(cfg.get("ai_face_fidelity", DEFAULT_CODEFORMER_FIDELITY)),
            },
            "defects_targeted": ["Baixa Resolução Facial Analógica (~240 TVL)"],
            "correction_summary": "Reconstrução neural de feições humanas preservando identidade.",
            "frames_affected": 0,
        },
        {
            "tool_id": "ai_rife_interpolation",
            "tool_name": "RIFE-NCNN (Interpolação Óptica de Movimento 60fps)",
            "stage": "Stage 3: Pós-Processamento Neural (DAG Sequencial)",
            "engine": f"RIFE ({DEFAULT_RIFE_MODEL})",
            "enabled": apply_rife,
            "status": "pending" if apply_rife else "skipped",
            "parameters": {"target_fps": DEFAULT_RIFE_TARGET_FPS, "model": DEFAULT_RIFE_MODEL},
            "defects_targeted": ["Judder Temporal / Baixa Taxa de Quadros"],
            "correction_summary": "Síntese de quadros intermediários por fluxo óptico para 60fps.",
            "frames_affected": 0,
        },
        {
            "tool_id": "ai_super_resolution",
            "tool_name": "Real-ESRGAN / Real-CUGAN (Super-Resolução Neural)",
            "stage": "Stage 3: Pós-Processamento Neural (DAG Sequencial)",
            "engine": str(cfg.get("ai_upscaler_model", DEFAULT_UPSCALER_MODEL)),
            "enabled": apply_upscale,
            "status": "pending" if apply_upscale else "skipped",
            "parameters": {"model": str(cfg.get("ai_upscaler_model", DEFAULT_UPSCALER_MODEL))},
            "defects_targeted": ["Perda de Nitidez Espacial e Microtexturas SD"],
            "correction_summary": "Ampliação neural de resolução sobre o vídeo encadeado.",
            "frames_affected": 0,
        },
        {
            "tool_id": "ai_whisper_transcription",
            "tool_name": "Faster-Whisper (Transcrição e Indexação WebVTT)",
            "stage": "Stage 3: Acessibilidade & Indexação de Acervo",
            "engine": "Faster-Whisper",
            "enabled": True,
            "status": "pending",
            "parameters": {"model_size": str(cfg.get("whisper_model", "tiny"))},
            "defects_targeted": ["Ausência de Indexação Textual e Legendas de Acervo"],
            "correction_summary": "Extração vocal e geração de legendas sincronizadas (.vtt).",
            "frames_affected": 0,
        },
        {
            "tool_id": "scene_segmentation",
            "tool_name": "PySceneDetect (Segmentação Automática de Cenas e Capítulos)",
            "stage": "Stage 4: Catalogação & Empacotamento de Acervo",
            "engine": "PySceneDetect ContentDetector",
            "enabled": True,
            "status": "pending",
            "parameters": {"threshold": DEFAULT_SCENE_THRESHOLD},
            "defects_targeted": ["Cortes de Câmera e Transições Não Catalogadas"],
            "correction_summary": "Detecção de mudanças de plano e marcação de capítulos FFMETADATA.",
            "frames_affected": 0,
        },
    ]


def make_frame_defect_analyzer(
    width: int,
    height: int,
    fps: float,
    luma_threshold: float = DEFAULT_LUMA_THRESHOLD,
    base_start_sec: float = 0.0,
) -> Callable[[int, bytes, str], Dict[str, Any]]:
    """Create a lexical closure that analyzes raw YUV420p frames for analog defects in real time.

    Encapsulates previous scanline reference inside the closure to measure temporal/spatial
    jitter and flagging without any global or class-level mutable state.
    """
    safe_w = max(0, int(width))
    safe_h = max(0, int(height))
    safe_fps = fps if fps > 0 else DEFAULT_NTSC_FPS
    y_size = safe_w * safe_h
    uv_w = safe_w // 2
    uv_h = safe_h // 2
    uv_size = uv_w * uv_h

    closure_state: Dict[str, Any] = {
        "prev_mid_luma": None,
    }

    def analyze_frame(frame_idx: int, buf: bytes, action_taken: str = "kept") -> Dict[str, Any]:
        mv = memoryview(buf)
        buf_len = len(mv)
        actual_y_len = min(buf_len, y_size) if y_size > 0 else buf_len

        y_plane = mv[:actual_y_len]
        y_stride = max(1, actual_y_len // 256)
        y_sample = y_plane[::y_stride]
        sample_len = len(y_sample)

        if sample_len == 0:
            return {
                "frame_idx": frame_idx,
                "timecode": sec_to_timecode(base_start_sec + (frame_idx / safe_fps)),
                "mean_luma": 0.0,
                "min_luma": 0.0,
                "max_luma": 0.0,
                "mean_cb": float(BT601_CHROMA_NEUTRAL),
                "mean_cr": float(BT601_CHROMA_NEUTRAL),
                "chroma_saturation_max": 0.0,
                "clipped_luma_ratio": 0.0,
                "crushed_luma_ratio": 0.0,
                "clipped_chroma_ratio": 0.0,
                "flagging_skew_px": 0.0,
                "jitter_delta_px": 0.0,
                "noise_variance": 0.0,
                "head_switching_delta": 0.0,
                "dropout_scanlines": [],
                "is_no_signal": True,
                "no_signal_type": "black",
                "anomalies": [],
            }

        mean_luma = sum(y_sample) / sample_len
        min_luma = float(min(y_sample))
        max_luma = float(max(y_sample))

        clipped_luma_ratio = (
            sum(1 for val in y_sample if val > BT601_LUMA_MAX_LEGAL) / sample_len
        )
        crushed_luma_ratio = (
            sum(1 for val in y_sample if val < BT601_LUMA_MIN_LEGAL) / sample_len
        )

        # Chroma U (Cb) and V (Cr) analysis when full YUV420p planes are present
        mean_cb = float(BT601_CHROMA_NEUTRAL)
        mean_cr = float(BT601_CHROMA_NEUTRAL)
        chroma_sat_max = 0.0
        clipped_chroma_ratio = 0.0

        if uv_size > 0 and buf_len >= y_size + (2 * uv_size):
            u_plane = mv[y_size : y_size + uv_size]
            v_plane = mv[y_size + uv_size : y_size + (2 * uv_size)]
            uv_stride = max(1, uv_size // 128)
            u_sample = u_plane[::uv_stride]
            v_sample = v_plane[::uv_stride]
            uv_len = min(len(u_sample), len(v_sample))
            if uv_len > 0:
                mean_cb = sum(u_sample[:uv_len]) / uv_len
                mean_cr = sum(v_sample[:uv_len]) / uv_len
                clipped_chroma = 0
                for cb, cr in zip(u_sample[:uv_len], v_sample[:uv_len]):
                    sat = float(abs(cb - BT601_CHROMA_NEUTRAL) + abs(cr - BT601_CHROMA_NEUTRAL))
                    if sat > chroma_sat_max:
                        chroma_sat_max = sat
                    if (
                        cb < BT601_CHROMA_MIN_LEGAL
                        or cb > BT601_CHROMA_MAX_LEGAL
                        or cr < BT601_CHROMA_MIN_LEGAL
                        or cr > BT601_CHROMA_MAX_LEGAL
                        or sat > MAX_LEGAL_CHROMA_SATURATION
                    ):
                        clipped_chroma += 1
                clipped_chroma_ratio = clipped_chroma / uv_len

        is_no_sig, sig_type = vhs_common.is_no_signal_frame(mean_luma, mean_cb, mean_cr)
        if mean_luma <= luma_threshold:
            is_no_sig = True
            sig_type = "black"

        # Spatial & Geometric Scanline Metrics (Dropouts, Flagging, Jitter, Noise, Head-Switching)
        dropout_lines: List[int] = []
        flagging_skew_px = 0.0
        jitter_delta_px = 0.0
        noise_variance = 0.0
        head_switching_delta = 0.0

        if safe_w >= 8 and safe_h >= 8 and actual_y_len >= safe_w * safe_h:
            line_step = max(1, safe_w // 32)
            # 1. Check candidate scanlines for white magnetic oxide dropout streaks
            if max_luma >= DEFAULT_DROPOUT_LUMA_THRESHOLD:
                row_step = max(1, safe_h // 16)
                for row in range(0, safe_h, row_step):
                    row_slice = bytes(y_plane[row * safe_w : (row + 1) * safe_w : line_step])
                    if DropoutCleaner.is_dropout_line(
                        row_slice,
                        threshold=DEFAULT_DROPOUT_LUMA_THRESHOLD,
                        ratio=DEFAULT_DROPOUT_LINE_RATIO,
                    ):
                        dropout_lines.append(row)

            # 2. Top-of-frame Flagging (VBI / Upper Skew vs Reference Active Picture)
            top_rows = min(FLAGGING_TOP_SCANLINES, max(1, safe_h // 4))
            ref_row = min(safe_h - 1, max(top_rows, safe_h // 3))
            half_w = max(1, safe_w // 2)
            top_left = y_plane[0 : half_w : line_step]
            top_right = y_plane[half_w : safe_w : line_step]
            ref_left = y_plane[ref_row * safe_w : ref_row * safe_w + half_w : line_step]
            ref_right = y_plane[ref_row * safe_w + half_w : (ref_row + 1) * safe_w : line_step]
            if len(top_left) > 0 and len(top_right) > 0 and len(ref_left) > 0 and len(ref_right) > 0:
                tl_mean = sum(top_left) / len(top_left)
                tr_mean = sum(top_right) / len(top_right)
                rl_mean = sum(ref_left) / len(ref_left)
                rr_mean = sum(ref_right) / len(ref_right)
                flagging_skew_px = round(abs((tl_mean - tr_mean) - (rl_mean - rr_mean)), 2)

            # 3. Horizontal Time-Base Jitter & High-Frequency Analog Noise
            mid_row = safe_h // 2
            next_row = min(safe_h - 1, mid_row + 1)
            odd_line = y_plane[mid_row * safe_w : (mid_row + 1) * safe_w : line_step]
            even_line = y_plane[next_row * safe_w : (next_row + 1) * safe_w : line_step]
            pair_len = min(len(odd_line), len(even_line))
            if pair_len > 1:
                jitter_delta_px = round(
                    sum(abs(int(a) - int(b)) for a, b in zip(odd_line[:pair_len], even_line[:pair_len]))
                    / pair_len,
                    2,
                )
                noise_variance = round(
                    sum(abs(int(odd_line[i]) - int(odd_line[i - 1])) for i in range(1, pair_len))
                    / (pair_len - 1),
                    2,
                )

            # 4. Bottom Head-Switching Noise (last 12 lines vs lower-mid active lines)
            hs_rows = min(OVERSCAN_BLANKING_HEIGHT_PX, max(1, safe_h // 4))
            bot_start = (safe_h - hs_rows) * safe_w
            above_start = max(0, (safe_h - (hs_rows * 2)) * safe_w)
            bot_slice = y_plane[bot_start : safe_h * safe_w : line_step]
            above_slice = y_plane[above_start : bot_start : line_step]
            cmp_len = min(len(bot_slice), len(above_slice))
            if cmp_len > 0:
                head_switching_delta = round(
                    sum(abs(int(a) - int(b)) for a, b in zip(bot_slice[:cmp_len], above_slice[:cmp_len]))
                    / cmp_len,
                    2,
                )
        else:
            # Compact buffer fallback for 1D or tiny synthetic test buffers
            if sample_len > 1:
                noise_variance = round(
                    sum(abs(int(y_sample[i]) - int(y_sample[i - 1])) for i in range(1, sample_len))
                    / (sample_len - 1),
                    2,
                )
                prev_luma = closure_state["prev_mid_luma"]
                if prev_luma is not None:
                    jitter_delta_px = round(abs(mean_luma - float(prev_luma)), 2)
            if DropoutCleaner.is_dropout_line(
                bytes(y_sample),
                threshold=DEFAULT_DROPOUT_LUMA_THRESHOLD,
                ratio=DEFAULT_DROPOUT_LINE_RATIO,
            ):
                dropout_lines.append(0)

        closure_state["prev_mid_luma"] = mean_luma

        # Assemble concrete frame anomalies and their real-time corrections
        anomalies: List[Dict[str, Any]] = []
        tc_str = sec_to_timecode(base_start_sec + (frame_idx / safe_fps))

        if is_no_sig:
            remediation_map = {
                "frozen": "Congelamento TBC Frame-Hold (último quadro íntegro repetido sem perda de sincronia labial)",
                "dropped": "Descarte seletivo de quadro sem sinal",
                "kept": "Preservação em modo Passthrough bit-perfect",
            }
            anomalies.append(
                {
                    "category": "signal_loss",
                    "defect_type": (
                        "Perda de Portadora RF / Tela Azul TBC"
                        if sig_type == "blue_screen"
                        else "Perda de Sinal Analógico / Quadro Preto (Y <= Limiar)"
                    ),
                    "severity": "Alta",
                    "cause": "Ausência de modulação FM de RF ou pausa de gravação na fita magnética.",
                    "tool_applied": "digital_tbc_frame_hold",
                    "correction_applied": remediation_map.get(action_taken, remediation_map["frozen"]),
                    "metrics": {
                        "mean_luma": round(mean_luma, 2),
                        "mean_cb": round(mean_cb, 2),
                        "mean_cr": round(mean_cr, 2),
                    },
                }
            )

        if dropout_lines:
            anomalies.append(
                {
                    "category": "dropout",
                    "defect_type": "Magnetic Oxide Dropouts (Riscos Horizontais Brancos Transitórios)",
                    "severity": "Alta",
                    "cause": "Desprendimento de óxido magnético ou poeira sobre a fita causando pico de portadora.",
                    "tool_applied": "magnetic_dropout_cleaner",
                    "correction_applied": (
                        f"Interpolação espaço-temporal via DropoutCleaner ({DropoutCleaner.get_ffmpeg_filter()}) "
                        f"nas scanlines {dropout_lines[:4]}."
                    ),
                    "metrics": {
                        "max_luma": round(max_luma, 1),
                        "dropout_scanlines": dropout_lines[:8],
                    },
                }
            )

        if flagging_skew_px >= FLAGGING_SKEW_THRESHOLD:
            anomalies.append(
                {
                    "category": "flagging",
                    "defect_type": "Flagging / Distorção Horizontal de Topo de Quadro (Skew VBI)",
                    "severity": "Média",
                    "cause": "Tensão mecânica irregular da fita na entrada do tambor rotativo durante o VBI.",
                    "tool_applied": "digital_tbc_frame_hold",
                    "correction_applied": (
                        "Estabilização de fase horizontal via TBC Digital e reenquadramento geométrico 4:3."
                    ),
                    "metrics": {"flagging_skew_px": flagging_skew_px},
                }
            )

        if jitter_delta_px >= JITTER_DELTA_THRESHOLD and not is_no_sig:
            anomalies.append(
                {
                    "category": "jitter",
                    "defect_type": "Time-Base Jitter (Instabilidade de Sincronismo Horizontal de Linha)",
                    "severity": "Média",
                    "cause": "Flutuação mecânica (wow & flutter) do cilindro de cabeças e estiramento da fita.",
                    "tool_applied": "deinterlacing_engine",
                    "correction_applied": (
                        "Alinhamento temporal de campos e reconstrução progressiva double-rate (QTGMC/BWDIF)."
                    ),
                    "metrics": {"jitter_delta_px": jitter_delta_px},
                }
            )

        if (
            clipped_chroma_ratio >= BLOWN_OUT_CHROMA_RATIO_THRESHOLD
            or (clipped_luma_ratio >= CLIPPED_LUMA_RATIO_THRESHOLD and not dropout_lines)
        ):
            anomalies.append(
                {
                    "category": "blown_out_colors",
                    "defect_type": "Cores Estouradas / Estouro de Luminância e Gamut de Crominância",
                    "severity": "Alta" if clipped_chroma_ratio >= 0.15 or clipped_luma_ratio >= 0.25 else "Média",
                    "cause": (
                        "Sobremodulação da subportadora Color-Under (629 kHz) ou ganho AGC excessivo "
                        "ultrapassando limites ITU-R BT.601 (Y > 235 ou Cb/Cr fora de 16–240)."
                    ),
                    "tool_applied": "colorimetry_geometry_standardizer",
                    "correction_applied": (
                        "Realinhamento planar chromashift, atenuação de picos via HQDN3D e "
                        "mapeamento legalizado para espaço de cores ITU-R BT.709."
                    ),
                    "metrics": {
                        "max_luma": round(max_luma, 1),
                        "chroma_saturation_max": round(chroma_sat_max, 1),
                        "clipped_luma_ratio": round(clipped_luma_ratio, 3),
                        "clipped_chroma_ratio": round(clipped_chroma_ratio, 3),
                    },
                }
            )

        if not is_no_sig and crushed_luma_ratio >= BLACK_CRUSH_RATIO_THRESHOLD:
            anomalies.append(
                {
                    "category": "luminance_chrominance",
                    "defect_type": "Excursão de Luminância / Esmagamento de Pretos (Black Crush < 16 IRE)",
                    "severity": "Média",
                    "cause": "Desvio de pedestal analógico (setup 7.5 IRE) durante digitalização composta.",
                    "tool_applied": "colorimetry_geometry_standardizer",
                    "correction_applied": "Padronização de curva de transferência e matriz de luminância BT.709.",
                    "metrics": {
                        "min_luma": round(min_luma, 1),
                        "crushed_luma_ratio": round(crushed_luma_ratio, 3),
                    },
                }
            )

        if noise_variance >= ANALOG_NOISE_VARIANCE_THRESHOLD and not is_no_sig:
            anomalies.append(
                {
                    "category": "analog_noise",
                    "defect_type": "Ruído Analógico de RF / Granulação de Luminância e Crominância",
                    "severity": "Média",
                    "cause": "Baixa relação sinal-ruído (SNR) da fita magnética e ruído térmico de cabeças.",
                    "tool_applied": "spatio_temporal_denoiser",
                    "correction_applied": "Filtragem espaço-temporal 3D (hqdn3d=3:2:6:4) sem efeito ghosting.",
                    "metrics": {"noise_variance": noise_variance},
                }
            )

        if head_switching_delta >= HEAD_SWITCHING_NOISE_THRESHOLD and not is_no_sig:
            anomalies.append(
                {
                    "category": "head_switching",
                    "defect_type": "Head Switching Noise (Ruído de Comutação de Cabeças no Rodapé)",
                    "severity": "Contínua",
                    "cause": "Transiente mecânico de comutação entre as cabeças A e B do tambor helicoidal.",
                    "tool_applied": "overscan_blanking_mask",
                    "correction_applied": (
                        f"Aplicação de máscara preta de overscan nas {OVERSCAN_BLANKING_HEIGHT_PX}px "
                        "inferiores via drawbox."
                    ),
                    "metrics": {"head_switching_delta": head_switching_delta},
                }
            )

        return {
            "frame_idx": frame_idx,
            "timecode": tc_str,
            "mean_luma": round(mean_luma, 2),
            "min_luma": round(min_luma, 1),
            "max_luma": round(max_luma, 1),
            "mean_cb": round(mean_cb, 2),
            "mean_cr": round(mean_cr, 2),
            "chroma_saturation_max": round(chroma_sat_max, 1),
            "clipped_luma_ratio": round(clipped_luma_ratio, 3),
            "crushed_luma_ratio": round(crushed_luma_ratio, 3),
            "clipped_chroma_ratio": round(clipped_chroma_ratio, 3),
            "flagging_skew_px": flagging_skew_px,
            "jitter_delta_px": jitter_delta_px,
            "noise_variance": noise_variance,
            "head_switching_delta": head_switching_delta,
            "dropout_scanlines": dropout_lines,
            "is_no_signal": is_no_sig,
            "no_signal_type": sig_type,
            "anomalies": anomalies,
        }

    return analyze_frame


def make_archival_report_session(
    source_path: str,
    output_path: Optional[str] = None,
    fps: float = DEFAULT_NTSC_FPS,
    width: int = NTSC_WIDTH,
    height: int = NTSC_HEIGHT,
    base_start_sec: float = 0.0,
    luma_threshold: float = DEFAULT_LUMA_THRESHOLD,
    initial_report: Optional[Mapping[str, Any]] = None,
    pipeline_params: Optional[Mapping[str, Any]] = None,
    resolved_deint: str = "bwdif",
    audio_mode: str = "stereo",
    target_1080p: bool = True,
    encoder: str = "libx264",
) -> Dict[str, Callable[..., Any]]:
    """Create a closure-backed archival report session synchronized with video processing.

    Eliminates global state and external mutations: all defect events, per-tool logs,
    and frame telemetry are encapsulated inside the closure and atomically persisted
    alongside the video checkpoint so interrupted jobs resume from the exact frame.
    """
    target_file = output_path or source_path
    safe_fps = fps if fps > 0 else DEFAULT_NTSC_FPS
    analyze_frame = make_frame_defect_analyzer(
        width=width,
        height=height,
        fps=safe_fps,
        luma_threshold=luma_threshold,
        base_start_sec=base_start_sec,
    )

    tools_list = build_pipeline_tools_registry(
        params=pipeline_params,
        resolved_deint=resolved_deint,
        audio_mode=audio_mode,
        start_sec=base_start_sec,
        target_1080p=target_1080p,
        encoder=encoder,
    )
    tools_by_id: Dict[str, Dict[str, Any]] = {t["tool_id"]: dict(t) for t in tools_list}

    state: Dict[str, Any] = {
        "file_path": source_path,
        "output_path": target_file,
        "archival_standards": list(ARCHIVAL_STANDARD_COMPLIANCE),
        "metadata": {
            "file_path": source_path,
            "width": width,
            "height": height,
            "fps": safe_fps,
            "duration": 0.0,
            "video_codec": "unknown",
            "audio_codec": "aac",
            "audio_channels": 2,
            "audio_sample_rate": 48000,
            "pix_fmt": "yuv420p",
        },
        "black_leader_sec": round(base_start_sec, 3),
        "interlace_status": {"is_interlaced": resolved_deint != "none", "summary": f"Active ({resolved_deint})"},
        "audio_layout": {"layout": audio_mode, "reason": f"Política de canais: {audio_mode}"},
        "signal_metrics": {
            "max_dropout_tout": 0.0,
            "avg_dropout_tout": 0.0,
            "min_luma_sampled": float(BT601_LUMA_MAX_LEGAL),
            "max_luma_sampled": float(BT601_LUMA_MIN_LEGAL),
            "max_chroma_saturation": 0.0,
            "dropout_risk": "baixa",
            "flagging_risk": "baixa",
            "jitter_risk": "baixa",
            "blown_out_colors_detected": False,
        },
        "defects_catalog": [],
        "defect_events_log": [],
        "open_events_by_category": {},
        "cumulative_telemetry": {
            "frames_analyzed": 0,
            "kept_frames": 0,
            "frozen_frames": 0,
            "dropped_frames": 0,
            "no_signal_frames": 0,
            "dropout_frames": 0,
            "flagging_frames": 0,
            "jitter_frames": 0,
            "luma_clipping_frames": 0,
            "black_crush_frames": 0,
            "blown_out_color_frames": 0,
            "analog_noise_frames": 0,
            "head_switching_frames": 0,
            "min_luma_observed": float(BT601_LUMA_MAX_LEGAL),
            "max_luma_observed": 0.0,
            "max_chroma_sat_observed": 0.0,
            "max_flagging_skew_px": 0.0,
            "max_jitter_delta_px": 0.0,
            "max_noise_variance": 0.0,
        },
        "sync_state": {
            "last_synced_frame": 0,
            "last_synced_timecode": sec_to_timecode(base_start_sec),
            "last_synced_video_sec": round(base_start_sec, 3),
            "elapsed_seconds": 0.0,
            "status": "initialized",
            "resumed_count": 0,
            "resume_history": [],
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        },
    }

    if initial_report:
        for key in (
            "metadata",
            "black_leader_sec",
            "interlace_status",
            "audio_layout",
            "signal_metrics",
            "defects_catalog",
        ):
            if key in initial_report and initial_report[key]:
                state[key] = copy.deepcopy(initial_report[key])
        if "defect_events_log" in initial_report and isinstance(initial_report["defect_events_log"], list):
            state["defect_events_log"] = copy.deepcopy(initial_report["defect_events_log"])
        if "cumulative_telemetry" in initial_report and isinstance(initial_report["cumulative_telemetry"], dict):
            state["cumulative_telemetry"].update(copy.deepcopy(initial_report["cumulative_telemetry"]))
        if "sync_state" in initial_report and isinstance(initial_report["sync_state"], dict):
            state["sync_state"].update(copy.deepcopy(initial_report["sync_state"]))
        if "pipeline_tools_registry" in initial_report and isinstance(initial_report["pipeline_tools_registry"], list):
            for saved_tool in initial_report["pipeline_tools_registry"]:
                tid = saved_tool.get("tool_id")
                if tid in tools_by_id:
                    tools_by_id[tid]["frames_affected"] = int(
                        saved_tool.get("frames_affected", tools_by_id[tid]["frames_affected"])
                    )
                    if saved_tool.get("status") in ("applied", "completed", "degraded_fallback"):
                        tools_by_id[tid]["status"] = saved_tool["status"]

    def _refresh_signal_metrics() -> None:
        tel = state["cumulative_telemetry"]
        sig = state["signal_metrics"]
        if tel["frames_analyzed"] > 0:
            sig["min_luma_sampled"] = round(float(tel["min_luma_observed"]), 1)
            sig["max_luma_sampled"] = round(float(tel["max_luma_observed"]), 1)
            sig["max_chroma_saturation"] = round(float(tel["max_chroma_sat_observed"]), 1)
            sig["blown_out_colors_detected"] = bool(tel["blown_out_color_frames"] > 0)
            if tel["dropout_frames"] > 0:
                sig["max_dropout_tout"] = max(float(sig.get("max_dropout_tout", 0.0)), 6.0)
                sig["dropout_risk"] = "alta" if tel["dropout_frames"] > 5 else "moderada"
            if tel["flagging_frames"] > 0:
                sig["flagging_risk"] = "alta" if tel["flagging_frames"] > 10 else "moderada"
            if tel["jitter_frames"] > 0:
                sig["jitter_risk"] = "alta" if tel["jitter_frames"] > 10 else "moderada"

    def record_frame(frame_idx: int, buf: bytes, action_taken: str = "kept") -> Dict[str, Any]:
        """Inspect a single frame in real time and record any detected defects and corrections."""
        diag = analyze_frame(frame_idx, buf, action_taken)
        tel = state["cumulative_telemetry"]

        tel["frames_analyzed"] = max(int(tel["frames_analyzed"]), frame_idx)
        if action_taken == "kept":
            tel["kept_frames"] += 1
        elif action_taken == "frozen":
            tel["frozen_frames"] += 1
        elif action_taken == "dropped":
            tel["dropped_frames"] += 1

        if diag["min_luma"] < tel["min_luma_observed"]:
            tel["min_luma_observed"] = diag["min_luma"]
        if diag["max_luma"] > tel["max_luma_observed"]:
            tel["max_luma_observed"] = diag["max_luma"]
        if diag["chroma_saturation_max"] > tel["max_chroma_sat_observed"]:
            tel["max_chroma_sat_observed"] = diag["chroma_saturation_max"]
        if diag["flagging_skew_px"] > tel["max_flagging_skew_px"]:
            tel["max_flagging_skew_px"] = diag["flagging_skew_px"]
        if diag["jitter_delta_px"] > tel["max_jitter_delta_px"]:
            tel["max_jitter_delta_px"] = diag["jitter_delta_px"]
        if diag["noise_variance"] > tel["max_noise_variance"]:
            tel["max_noise_variance"] = diag["noise_variance"]

        # Update active continuous tools frame counters
        for continuous_tid in (
            "digital_tbc_frame_hold",
            "overscan_blanking_mask",
            "chroma_phase_alignment",
            "spatio_temporal_denoiser",
            "deinterlacing_engine",
            "colorimetry_geometry_standardizer",
        ):
            if continuous_tid in tools_by_id and tools_by_id[continuous_tid]["enabled"]:
                tools_by_id[continuous_tid]["frames_affected"] = tel["frames_analyzed"]

        category_counter_map = {
            "signal_loss": "no_signal_frames",
            "dropout": "dropout_frames",
            "flagging": "flagging_frames",
            "jitter": "jitter_frames",
            "blown_out_colors": "blown_out_color_frames",
            "luminance_chrominance": "black_crush_frames",
            "analog_noise": "analog_noise_frames",
            "head_switching": "head_switching_frames",
        }
        if diag["clipped_luma_ratio"] >= CLIPPED_LUMA_RATIO_THRESHOLD:
            tel["luma_clipping_frames"] += 1

        open_map: Dict[str, Dict[str, Any]] = state["open_events_by_category"]
        events_log: List[Dict[str, Any]] = state["defect_events_log"]

        for anom in diag["anomalies"]:
            cat = anom["category"]
            counter_key = category_counter_map.get(cat)
            if counter_key:
                tel[counter_key] += 1

            tool_id = anom.get("tool_applied", "")
            if tool_id in tools_by_id and cat in ("dropout", "signal_loss"):
                tools_by_id[tool_id]["frames_affected"] += 1
                tools_by_id[tool_id]["status"] = "applied"

            existing = open_map.get(cat)
            if existing and (frame_idx - int(existing["frame_end"])) <= 2:
                existing["frame_end"] = frame_idx
                existing["frame_count"] = int(existing["frame_end"]) - int(existing["frame_start"]) + 1
                existing["timecode_end"] = diag["timecode"]
                for m_k, m_v in anom.get("metrics", {}).items():
                    if isinstance(m_v, (int, float)):
                        prev_v = existing["metrics"].get(m_k, m_v)
                        existing["metrics"][m_k] = max(prev_v, m_v) if "max" in m_k else m_v
            else:
                if len(events_log) < MAX_DEFECT_EVENTS_LOG:
                    new_event = {
                        "event_id": len(events_log) + 1,
                        "category": cat,
                        "defect_type": anom["defect_type"],
                        "frame_start": frame_idx,
                        "frame_end": frame_idx,
                        "frame_count": 1,
                        "timecode_start": diag["timecode"],
                        "timecode_end": diag["timecode"],
                        "severity": anom["severity"],
                        "cause": anom["cause"],
                        "tool_applied": tool_id,
                        "correction_applied": anom["correction_applied"],
                        "status": "corrigido",
                        "metrics": dict(anom.get("metrics", {})),
                    }
                    events_log.append(new_event)
                    open_map[cat] = new_event

        _refresh_signal_metrics()
        state["sync_state"]["last_synced_frame"] = frame_idx
        state["sync_state"]["last_synced_timecode"] = diag["timecode"]
        state["sync_state"]["last_synced_video_sec"] = round(base_start_sec + (frame_idx / safe_fps), 3)
        return diag

    def record_tool_execution(tool_id: str, **updates: Any) -> Dict[str, Any]:
        """Update or register a specific pipeline tool's execution status and parameters."""
        if tool_id not in tools_by_id:
            tools_by_id[tool_id] = {
                "tool_id": tool_id,
                "tool_name": str(updates.get("tool_name", tool_id)),
                "stage": str(updates.get("stage", "Stage 3: Pós-Processamento")),
                "engine": str(updates.get("engine", tool_id)),
                "enabled": bool(updates.get("enabled", True)),
                "status": str(updates.get("status", "applied")),
                "parameters": dict(updates.get("parameters", {})),
                "defects_targeted": list(updates.get("defects_targeted", [])),
                "correction_summary": str(updates.get("correction_summary", "")),
                "frames_affected": int(updates.get("frames_affected", 0)),
            }
        else:
            target = tools_by_id[tool_id]
            for k, v in updates.items():
                if k == "parameters" and isinstance(v, Mapping):
                    target["parameters"].update(dict(v))
                else:
                    target[k] = v
        return copy.deepcopy(tools_by_id[tool_id])

    def truncate_to_frame(target_frame: int, reason: str = "checkpoint_resume") -> Dict[str, Any]:
        """Rewind and synchronize report state to an exact frame checkpoint upon resumption."""
        safe_frame = max(0, int(target_frame))
        truncated_events: List[Dict[str, Any]] = []
        open_map: Dict[str, Dict[str, Any]] = {}

        for ev in state["defect_events_log"]:
            f_start = int(ev.get("frame_start", 0))
            f_end = int(ev.get("frame_end", 0))
            if f_start > safe_frame:
                continue
            ev_copy = copy.deepcopy(ev)
            if f_end > safe_frame:
                ev_copy["frame_end"] = safe_frame
                ev_copy["frame_count"] = safe_frame - f_start + 1
                ev_copy["timecode_end"] = sec_to_timecode(base_start_sec + (safe_frame / safe_fps))
            ev_copy["event_id"] = len(truncated_events) + 1
            truncated_events.append(ev_copy)
            if int(ev_copy["frame_end"]) == safe_frame:
                open_map[ev_copy["category"]] = ev_copy

        state["defect_events_log"] = truncated_events
        state["open_events_by_category"] = open_map

        tel = state["cumulative_telemetry"]
        tel["frames_analyzed"] = safe_frame
        category_counter_map = {
            "signal_loss": "no_signal_frames",
            "dropout": "dropout_frames",
            "flagging": "flagging_frames",
            "jitter": "jitter_frames",
            "blown_out_colors": "blown_out_color_frames",
            "luminance_chrominance": "black_crush_frames",
            "analog_noise": "analog_noise_frames",
            "head_switching": "head_switching_frames",
        }
        for counter_key in category_counter_map.values():
            tel[counter_key] = 0
        if "magnetic_dropout_cleaner" in tools_by_id:
            tools_by_id["magnetic_dropout_cleaner"]["frames_affected"] = 0

        for ev in truncated_events:
            cat = str(ev.get("category", ""))
            f_count = int(ev.get("frame_count", 0))
            c_key = category_counter_map.get(cat)
            if c_key:
                tel[c_key] += f_count
            if cat == "dropout" and "magnetic_dropout_cleaner" in tools_by_id:
                tools_by_id["magnetic_dropout_cleaner"]["frames_affected"] += f_count

        for continuous_tid in (
            "digital_tbc_frame_hold",
            "overscan_blanking_mask",
            "chroma_phase_alignment",
            "spatio_temporal_denoiser",
            "deinterlacing_engine",
            "colorimetry_geometry_standardizer",
        ):
            if continuous_tid in tools_by_id and tools_by_id[continuous_tid]["enabled"]:
                tools_by_id[continuous_tid]["frames_affected"] = safe_frame

        sync = state["sync_state"]
        sync["last_synced_frame"] = safe_frame
        sync["last_synced_timecode"] = sec_to_timecode(base_start_sec + (safe_frame / safe_fps))
        sync["last_synced_video_sec"] = round(base_start_sec + (safe_frame / safe_fps), 3)
        sync["resumed_count"] = int(sync.get("resumed_count", 0)) + 1
        sync["status"] = "resumed"
        sync["resume_history"].append(
            {
                "resumed_at_frame": safe_frame,
                "resumed_at_timecode": sync["last_synced_timecode"],
                "reason": reason,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
        )
        return get_snapshot()

    def get_snapshot() -> Dict[str, Any]:
        """Return an immutable deep copy of the complete archival report."""
        _refresh_signal_metrics()
        catalog = state["defects_catalog"]
        if not catalog:
            catalog = QualityControl._catalog_defects(
                state["metadata"],
                float(state["black_leader_sec"]),
                state["interlace_status"],
                state["audio_layout"],
                state["signal_metrics"],
            )
        return {
            "file_path": state["file_path"],
            "output_path": state["output_path"],
            "archival_standards": list(state["archival_standards"]),
            "metadata": copy.deepcopy(state["metadata"]),
            "black_leader_sec": state["black_leader_sec"],
            "interlace_status": copy.deepcopy(state["interlace_status"]),
            "audio_layout": copy.deepcopy(state["audio_layout"]),
            "signal_metrics": copy.deepcopy(state["signal_metrics"]),
            "defects_catalog": copy.deepcopy(catalog),
            "pipeline_tools_registry": [copy.deepcopy(t) for t in tools_by_id.values()],
            "defect_events_log": copy.deepcopy(state["defect_events_log"]),
            "cumulative_telemetry": copy.deepcopy(state["cumulative_telemetry"]),
            "sync_state": copy.deepcopy(state["sync_state"]),
        }

    def sync_to_disk(
        synced_frame: Optional[int] = None,
        elapsed_sec: float = 0.0,
        status: str = "in_progress",
    ) -> Tuple[str, str]:
        """Atomically persist both JSON and Markdown archival reports synchronized to the current frame."""
        sync = state["sync_state"]
        if synced_frame is not None:
            safe_f = max(0, int(synced_frame))
            sync["last_synced_frame"] = safe_f
            sync["last_synced_timecode"] = sec_to_timecode(base_start_sec + (safe_f / safe_fps))
            sync["last_synced_video_sec"] = round(base_start_sec + (safe_f / safe_fps), 3)
            state["cumulative_telemetry"]["frames_analyzed"] = max(
                int(state["cumulative_telemetry"]["frames_analyzed"]), safe_f
            )
        if elapsed_sec > 0:
            sync["elapsed_seconds"] = round(float(elapsed_sec), 2)
        sync["status"] = status
        sync["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

        if status == "completed":
            for t_obj in tools_by_id.values():
                if t_obj["enabled"] and t_obj["status"] == "active":
                    t_obj["status"] = "applied"

        snapshot = get_snapshot()
        json_path = f"{target_file}_qc_report.json"
        md_path = f"{target_file}_defect_report.md"

        parent_dir = os.path.dirname(os.path.abspath(target_file))
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)

        tmp_json = f"{json_path}.tmp"
        with open(tmp_json, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2, ensure_ascii=False)
        os.replace(tmp_json, json_path)

        md_content = QualityControl.generate_markdown_report(target_file, snapshot)
        tmp_md = f"{md_path}.tmp"
        with open(tmp_md, "w", encoding="utf-8") as f:
            f.write(md_content)
        os.replace(tmp_md, md_path)

        return json_path, md_path

    return {
        "record_frame": record_frame,
        "record_tool_execution": record_tool_execution,
        "truncate_to_frame": truncate_to_frame,
        "sync_to_disk": sync_to_disk,
        "get_snapshot": get_snapshot,
    }


class QualityControl:
    """Automated inspection and archival reporting of analog tape defects, signal metrics, and tool fixes."""

    @classmethod
    def run_qc(
        cls,
        filepath: str,
        pipeline_params: Optional[Mapping[str, Any]] = None,
    ) -> Optional[str]:
        """Execute full technical inspection and generate structured JSON and Markdown defect reports."""
        if not os.path.exists(filepath):
            log.error(f"[QC] Arquivo não encontrado para inspeção: {filepath}")
            return None

        report_data = cls.inspect_media(filepath, pipeline_params=pipeline_params)
        report_json_path = f"{filepath}_qc_report.json"
        tmp_json = f"{report_json_path}.tmp"
        with open(tmp_json, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_json, report_json_path)

        report_md_path = f"{filepath}_defect_report.md"
        md_content = cls.generate_markdown_report(filepath, report_data)
        tmp_md = f"{report_md_path}.tmp"
        with open(tmp_md, "w", encoding="utf-8") as f:
            f.write(md_content)
        os.replace(tmp_md, report_md_path)

        log.info(f"[QC] Relatório técnico salvo em: {report_json_path}")
        log.info(f"[QC] Relatório forense Markdown salvo em: {report_md_path}")
        return report_json_path

    @classmethod
    def inspect_media(
        cls,
        filepath: str,
        pipeline_params: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Perform comprehensive signal, colorimetry, jitter, flagging, and artifact probe on a media file."""
        meta = vhs_common.probe_media(filepath)
        dur = float(meta.get("duration", 0.0))

        first_good_sec = 0.0
        try:
            from vhs_studio.video.direct_restore import find_first_video_frame

            first_good_sec = find_first_video_frame(filepath, max_scan_sec=min(120, max(1, int(dur))))
        except Exception as exc:
            log.warning(f"[QC] Não foi possível medir líder inicial com precisão ({exc})")

        sample_sec = first_good_sec + 15.0 if dur > (first_good_sec + 25.0) else first_good_sec
        interlace = vhs_common.detect_interlace_status(filepath, num_frames=300, start_sec=sample_sec)
        audio = vhs_common.detect_audio_layout(filepath, sample_sec=sample_sec, sample_duration=6.0)
        signal = cls._probe_signal_stats(filepath, sample_sec=sample_sec, num_frames=120)

        defects = cls._catalog_defects(meta, first_good_sec, interlace, audio, signal)
        tools_registry = build_pipeline_tools_registry(
            params=pipeline_params,
            resolved_deint="bwdif" if interlace.get("is_interlaced", True) else "none",
            audio_mode=str(audio.get("layout", "stereo")),
            start_sec=first_good_sec,
        )

        total_frames = int(dur * float(meta.get("fps", DEFAULT_NTSC_FPS))) if dur > 0 else 0
        return {
            "file_path": filepath,
            "archival_standards": list(ARCHIVAL_STANDARD_COMPLIANCE),
            "metadata": meta,
            "black_leader_sec": round(first_good_sec, 3),
            "interlace_status": interlace,
            "audio_layout": audio,
            "signal_metrics": signal,
            "defects_catalog": defects,
            "pipeline_tools_registry": tools_registry,
            "defect_events_log": [],
            "cumulative_telemetry": {
                "frames_analyzed": total_frames,
                "min_luma_observed": signal.get("min_luma_sampled", float(BT601_LUMA_MIN_LEGAL)),
                "max_luma_observed": signal.get("max_luma_sampled", float(BT601_LUMA_MAX_LEGAL)),
                "max_chroma_sat_observed": signal.get("max_chroma_saturation", 0.0),
            },
            "sync_state": {
                "last_synced_frame": total_frames,
                "last_synced_timecode": cls._sec_to_tc(dur),
                "last_synced_video_sec": round(dur, 3),
                "status": "inspected",
                "resumed_count": 0,
                "resume_history": [],
            },
        }

    @classmethod
    def _probe_signal_stats(
        cls,
        filepath: str,
        sample_sec: float,
        num_frames: int = 120,
    ) -> Dict[str, Any]:
        """Run FFmpeg signalstats filter to measure dropouts, luma/chroma bounds, gamut clipping, and jitter."""
        ffmpeg = Toolchain.get_ffmpeg_path()
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-ss",
            f"{max(0.0, sample_sec):.3f}",
            "-i",
            filepath,
            "-vf",
            "signalstats=stat=tout+vrep+brng",
            "-vframes",
            str(num_frames),
            "-an",
            "-f",
            "null",
            "-",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        stderr = res.stderr

        def _extract_floats(tag: str) -> List[float]:
            return [float(x) for x in re.findall(rf"{tag}:([0-9\.]+)", stderr)]

        touts = _extract_floats("TOUT")
        vreps = _extract_floats("VREP")
        brngs = _extract_floats("BRNG")
        ymins = _extract_floats("YMIN")
        ymaxs = _extract_floats("YMAX")
        yavgs = _extract_floats("YAVG")
        umins = _extract_floats("UMIN")
        umaxs = _extract_floats("UMAX")
        vmins = _extract_floats("VMIN")
        vmaxs = _extract_floats("VMAX")
        satmaxs = _extract_floats("SATMAX")

        max_tout = max(touts) if touts else 0.0
        avg_tout = (sum(touts) / len(touts)) if touts else 0.0
        max_vrep = max(vreps) if vreps else 0.0
        max_brng = max(brngs) if brngs else 0.0
        min_y = min(ymins) if ymins else float(BT601_LUMA_MIN_LEGAL)
        max_y = max(ymaxs) if ymaxs else float(BT601_LUMA_MAX_LEGAL)
        avg_y = (sum(yavgs) / len(yavgs)) if yavgs else 128.0
        min_u = min(umins) if umins else float(BT601_CHROMA_MIN_LEGAL)
        max_u = max(umaxs) if umaxs else float(BT601_CHROMA_MAX_LEGAL)
        min_v = min(vmins) if vmins else float(BT601_CHROMA_MIN_LEGAL)
        max_v = max(vmaxs) if vmaxs else float(BT601_CHROMA_MAX_LEGAL)
        max_sat = max(satmaxs) if satmaxs else 0.0

        luma_clipped = max_y > BT601_LUMA_MAX_LEGAL
        black_crushed = min_y < BT601_LUMA_MIN_LEGAL
        chroma_clipped = (
            min_u < BT601_CHROMA_MIN_LEGAL
            or max_u > BT601_CHROMA_MAX_LEGAL
            or min_v < BT601_CHROMA_MIN_LEGAL
            or max_v > BT601_CHROMA_MAX_LEGAL
            or max_sat > MAX_LEGAL_CHROMA_SATURATION
            or max_brng > 0.02
        )

        return {
            "max_dropout_tout": round(max_tout, 3),
            "avg_dropout_tout": round(avg_tout, 3),
            "min_luma_sampled": round(min_y, 1),
            "max_luma_sampled": round(max_y, 1),
            "avg_luma_sampled": round(avg_y, 1),
            "min_chroma_u": round(min_u, 1),
            "max_chroma_u": round(max_u, 1),
            "min_chroma_v": round(min_v, 1),
            "max_chroma_v": round(max_v, 1),
            "max_chroma_saturation": round(max_sat, 1),
            "out_of_broadcast_range_brng": round(max_brng, 4),
            "jitter_vrep_score": round(max_vrep, 3),
            "luma_clipping_detected": luma_clipped,
            "black_crush_detected": black_crushed,
            "blown_out_colors_detected": bool(chroma_clipped or luma_clipped),
            "dropout_risk": "alta" if max_tout > 5.0 else "moderada" if max_tout > 1.5 else "baixa",
            "jitter_risk": "alta" if max_vrep > 4.0 else "moderada" if max_vrep > 1.0 else "baixa",
            "flagging_risk": "moderada" if max_tout > 1.5 or max_vrep > 1.0 else "baixa",
        }

    @classmethod
    def _catalog_defects(
        cls,
        meta: Dict[str, Any],
        leader_sec: float,
        interlace: Dict[str, Any],
        audio: Dict[str, Any],
        signal: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Catalog all technical defects, affected intervals, causes, and standardized pipeline fixes."""
        defects: List[Dict[str, Any]] = []
        w = int(meta.get("width", NTSC_WIDTH))
        h = int(meta.get("height", NTSC_HEIGHT))
        end_tc = cls._sec_to_tc(float(meta.get("duration", 0.0)))
        start_tc = cls._sec_to_tc(leader_sec)

        # 1. Black Leader / Initial Signal Absence
        if leader_sec > 1.0:
            defects.append(
                {
                    "category": "signal_loss",
                    "tool_id": "leader_trim_sync",
                    "defect": "Líder Inicial Vazio / Ruído Estático",
                    "timecode_range": f"00:00:00.000 -> {start_tc}",
                    "affected_lines": "Quadro completo",
                    "cause": "Trecho inicial do carretel da fita anterior à gravação útil da filmadora.",
                    "severity": "Alta",
                    "recommended_fix": (
                        f"Podar {leader_sec:.3f}s via find_first_video_frame e "
                        "alinhar A/V no frame zero útil."
                    ),
                }
            )

        # 2. Head Switching Noise
        if h <= PAL_HEIGHT:
            defects.append(
                {
                    "category": "head_switching",
                    "tool_id": "overscan_blanking_mask",
                    "defect": "Head Switching Noise (Ruído de Comutação de Cabeças)",
                    "timecode_range": f"{start_tc} -> {end_tc}",
                    "affected_lines": f"Linhas {h - 16} a {h} (rodapé do quadro)",
                    "cause": (
                        "Comutação mecânica entre as cabeças A e B do tambor rotativo "
                        "do VCR antes do VBI inferior."
                    ),
                    "severity": "Contínua",
                    "recommended_fix": (
                        f"Aplicar drawbox ou crop de {OVERSCAN_BLANKING_HEIGHT_PX}px de overscan "
                        "inferior (overscan_blanking)."
                    ),
                }
            )

        # 3. Interlacing / Combing
        if interlace.get("is_interlaced", False) or float(meta.get("fps", DEFAULT_NTSC_FPS)) < 35.0:
            defects.append(
                {
                    "category": "interlacing_combing",
                    "tool_id": "deinterlacing_engine",
                    "defect": "Combing / Artefatos de Entrelaçamento Analógico",
                    "timecode_range": "Integral",
                    "affected_lines": "Scanlines alternadas (TFF/BFF)",
                    "cause": "Digitalização de campos analógicos entrelaçados (480i NTSC / 576i PAL).",
                    "severity": "Média",
                    "recommended_fix": (
                        "Desentrelaçamento double-rate via VapourSynth QTGMC ou FFmpeg BWDIF (60p estável)."
                    ),
                }
            )

        # 4. Dropouts
        if float(signal.get("max_dropout_tout", 0.0)) > 1.5:
            defects.append(
                {
                    "category": "dropout",
                    "tool_id": "magnetic_dropout_cleaner",
                    "defect": "Magnetic Oxide Dropouts (Riscos Brancos Transitórios)",
                    "timecode_range": "Transitório / Aleatório",
                    "affected_lines": "Scanlines isoladas de 1 frame",
                    "cause": (
                        "Desprendimento de óxido magnético e poeira causando perda "
                        "momentânea de portadora RF."
                    ),
                    "severity": "Alta" if float(signal.get("max_dropout_tout", 0.0)) > 5.0 else "Média",
                    "recommended_fix": (
                        "Filtro DropoutCleaner (tmedian=radius=1 + removegrain=1) com "
                        "interpolação temporal."
                    ),
                }
            )

        # 5. Chroma Bleed / Color Under
        defects.append(
            {
                "category": "luminance_chrominance",
                "tool_id": "chroma_phase_alignment",
                "defect": "Chroma Bleeding & Delay (Atraso e Borramento de Croma)",
                "timecode_range": "Integral",
                "affected_lines": "Canais U e V (Cb/Cr)",
                "cause": "Banda estreita da subportadora de cor heterodinada do padrão VHS (~629 kHz).",
                "severity": "Média",
                "recommended_fix": (
                    "Filtro chromashift para realinhamento espacial das componentes de cor sobre a luma Y."
                ),
            }
        )

        # 6. Flagging (Top-of-Frame Skew)
        defects.append(
            {
                "category": "flagging",
                "tool_id": "digital_tbc_frame_hold",
                "defect": "Flagging / Distorção Horizontal no Topo do Quadro (Skew VBI)",
                "timecode_range": f"{start_tc} -> {end_tc}",
                "affected_lines": f"Linhas 1 a {FLAGGING_TOP_SCANLINES} (topo do raster)",
                "cause": (
                    "Variação de tensão mecânica da fita ao entrar no cilindro de cabeças "
                    "deslocando o sincronismo horizontal AFC após o pulso vertical VBI."
                ),
                "severity": "Alta" if signal.get("flagging_risk") == "alta" else "Baixa",
                "recommended_fix": (
                    "Estabilização de sincronismo via TBC Frame-Lock e reenquadramento geométrico 4:3."
                ),
            }
        )

        # 7. Time-Base Jitter
        defects.append(
            {
                "category": "jitter",
                "tool_id": "digital_tbc_frame_hold",
                "defect": "Time-Base Jitter (Flutuação de Sincronismo Horizontal de Linha)",
                "timecode_range": "Integral",
                "affected_lines": "Scanlines horizontais adjacentes",
                "cause": (
                    "Microvariações de rotação do motor capstan/tambor (wow & flutter) e "
                    "elasticidade da fita alterando a duração de linha (63.555 us)."
                ),
                "severity": "Alta" if signal.get("jitter_risk") == "alta" else "Média",
                "recommended_fix": (
                    "Correção de Base de Tempo (TBC) combinada com reconstrução temporal QTGMC/BWDIF."
                ),
            }
        )

        # 8. Luminance / Chrominance Excursions & Blown-Out Colors (Cores Estouradas)
        min_y = float(signal.get("min_luma_sampled", BT601_LUMA_MIN_LEGAL))
        max_y = float(signal.get("max_luma_sampled", BT601_LUMA_MAX_LEGAL))
        blown_out = bool(
            signal.get("blown_out_colors_detected", False)
            or max_y > BT601_LUMA_MAX_LEGAL
            or min_y < BT601_LUMA_MIN_LEGAL
        )
        defects.append(
            {
                "category": "blown_out_colors",
                "tool_id": "colorimetry_geometry_standardizer",
                "defect": (
                    "Excursão de Luminância/Crominância e Cores Estouradas "
                    f"(YMin={min_y:.1f}, YMax={max_y:.1f})"
                ),
                "timecode_range": "Integral / Picos de Iluminação",
                "affected_lines": "Planos Y (16-235) e Cb/Cr (16-240)",
                "cause": (
                    "Sobremodulação FM de brancos (clipping > 235 IRE), esmagamento de pretos "
                    "(< 16 IRE) e saturação excessiva da subportadora de cor (gamut overflow)."
                ),
                "severity": "Alta" if blown_out else "Baixa",
                "recommended_fix": (
                    "Normalização colorimétrica ITU-R BT.709, contenção de faixa legal "
                    "e realinhamento planar chromashift."
                ),
            }
        )

        # 9. Analog Video RF Noise & Audio Hiss / Hum
        defects.append(
            {
                "category": "analog_noise",
                "tool_id": "spatio_temporal_denoiser",
                "defect": "Ruídos Analógicos de Vídeo (Granulação RF) e Áudio (Tape Hiss / Hum 60Hz)",
                "timecode_range": "Integral",
                "affected_lines": "Planos Y/U/V e espectro sonoro linear",
                "cause": (
                    "Ruído térmico de partículas magnéticas em baixa velocidade linear e "
                    "indução eletromagnética de rede elétrica 60Hz."
                ),
                "severity": "Média",
                "recommended_fix": (
                    "Filtro espaço-temporal 3D (hqdn3d=3:2:6:4) no vídeo e cadeia "
                    "dcshift + notch 60Hz + afftdn espectral no áudio."
                ),
            }
        )

        # 10. Audio Imbalance / Mute Channel
        audio_layout = audio.get("layout", "stereo")
        if audio_layout in ("mono_l", "mono_r"):
            dead_ch = "R" if audio_layout == "mono_l" else "L"
            good_ch = "L" if audio_layout == "mono_l" else "R"
            defects.append(
                {
                    "category": "audio_anomaly",
                    "tool_id": "audio_conditioning_dsp",
                    "defect": f"Assimetria Severa de Canais de Áudio (Canal {dead_ch} Mudo)",
                    "timecode_range": "Integral",
                    "affected_lines": "Canal de áudio",
                    "cause": (
                        f"Filmadora mono gravando em 1 trilha linear ou cabo RCA "
                        f"do canal {dead_ch} desconectado."
                    ),
                    "severity": "Crítica",
                    "recommended_fix": (
                        f"Duplicação mono de alta fidelidade {good_ch} -> {dead_ch} "
                        "(pan=stereo) e filtro notch 60Hz."
                    ),
                }
            )

        # 11. Non-standard Capture Width
        if w not in (NTSC_WIDTH, 1920):
            defects.append(
                {
                    "category": "geometry",
                    "tool_id": "colorimetry_geometry_standardizer",
                    "defect": f"Resolução de Captura Assimétrica ({w}x{h})",
                    "timecode_range": "Geometria do container",
                    "affected_lines": "Colunas de borda",
                    "cause": (
                        f"Dispositivo de captura digitalizou {w} colunas "
                        f"(cortando margem ativa NTSC padrão de {NTSC_WIDTH}px)."
                    ),
                    "severity": "Baixa",
                    "recommended_fix": (
                        "Pillarbox de proporção 4:3 com upscale Lanczos 1080p e conversão para espaço BT.709."
                    ),
                }
            )

        return defects

    @classmethod
    def generate_markdown_report(cls, filepath: str, data: Dict[str, Any]) -> str:
        """Render museum-grade forensic Markdown report detailing defects, per-tool logs, and sync state."""
        filename = os.path.basename(filepath)
        meta = data.get("metadata", {})
        leader = float(data.get("black_leader_sec", 0.0))
        audio = data.get("audio_layout", {})
        interlace = data.get("interlace_status", {})
        signal = data.get("signal_metrics", {})
        defects = data.get("defects_catalog", [])
        tools_reg = data.get("pipeline_tools_registry", [])
        events_log = data.get("defect_events_log", [])
        telemetry = data.get("cumulative_telemetry", {})
        sync_state = data.get("sync_state", {})
        standards = data.get("archival_standards", list(ARCHIVAL_STANDARD_COMPLIANCE))

        lines = [
            f"# Relatório de Inspeção Técnica e Defeitos: `{filename}`",
            "",
            f"> **Conformidade Museológica e Arquivística:** `{', '.join(standards)}`",
            "",
            "## 1. Metadados Físicos do Arquivo do Acervo",
            f"- **Arquivo:** `{filepath}`",
            f"- **Duração Total:** `{cls._sec_to_tc(float(meta.get('duration', 0.0)))}` "
            f"({float(meta.get('duration', 0.0)):.2f}s)",
            f"- **Resolução Nativa:** `{meta.get('width', 0)}x{meta.get('height', 0)}` @ "
            f"`{float(meta.get('fps', 0.0)):.2f} fps`",
            f"- **Codec de Vídeo:** `{meta.get('video_codec', 'unknown')}` ({meta.get('pix_fmt', '')})",
            f"- **Codec de Áudio:** `{meta.get('audio_codec', 'none')}` ({meta.get('audio_channels', 0)} canais, "
            f"{meta.get('audio_sample_rate', 0)} Hz)",
            f"- **Líder Inicial Preto:** `{leader:.3f}s` "
            f"({int(leader * float(meta.get('fps', DEFAULT_NTSC_FPS)))} frames sem sinal)",
            f"- **Classificação de Sinal:** `{interlace.get('summary', 'Inconclusivo')}`",
            f"- **Balanço Sonoro:** `{audio.get('reason', '')}`",
            "",
            "## 2. Inconsistências Analógicas Identificadas e Mapeamento de Correções",
            "",
            "| Falha / Defeito Observado | Intervalo / Momento | Causa Física no Meio Magnético | Severidade | "
            "Correção Aplicada |",
            "| :--- | :--- | :--- | :---: | :--- |",
        ]

        for d in defects:
            lines.append(
                f"| **{d['defect']}** | `{d['timecode_range']}` | {d['cause']} | **{d['severity']}** | "
                f"{d['recommended_fix']} |"
            )

        lines.extend(
            [
                "",
                "## 3. Diagnóstico de Sinal, Luminância/Crominância, Jitter, Flagging e Ruído de RF",
                f"- **Pico de Outliers Temporais (Dropouts TOUT):** `{signal.get('max_dropout_tout', 0.0)}`",
                f"- **Média de Outliers Temporais:** `{signal.get('avg_dropout_tout', 0.0)}`",
                f"- **Faixa de Luminância Amostrada (ITU-R BT.601 Legal 16–235):** "
                f"YMin `{signal.get('min_luma_sampled', 0.0)}` / YMax `{signal.get('max_luma_sampled', 0.0)}`",
                f"- **Saturação Máxima de Crominância (Cb/Cr):** `{signal.get('max_chroma_saturation', 0.0)}` "
                f"(Cores Estouradas: `{'SIM' if signal.get('blown_out_colors_detected') else 'NÃO'}`)",
                f"- **Classificação de Risco de Dropouts:** `{str(signal.get('dropout_risk', 'baixa')).upper()}`",
                f"- **Classificação de Risco de Flagging (Topo VBI):** "
                f"`{str(signal.get('flagging_risk', 'baixa')).upper()}`",
                f"- **Classificação de Risco de Time-Base Jitter:** "
                f"`{str(signal.get('jitter_risk', 'baixa')).upper()}`",
                "",
                "## 4. Recomendações para a Pipeline de Restauração",
                f"1. **Ponto Inicial:** Iniciar a partir de `{leader:.3f}s` para eliminar o líder preto.",
                "2. **Tratamento de Áudio:** Duplicar canal L -> R e habilitar filtro notch de 60Hz.",
                "3. **Mascaramento:** Habilitar `overscan_blanking` para ocultar os 12px de ruído inferior.",
                "4. **Filtro Temporal:** Habilitar `dropout_clean` contra riscos de perda magnética.",
            ]
        )

        if tools_reg:
            lines.extend(
                [
                    "",
                    "## 5. Registro Pormenorizado de Correção por Ferramenta da Pipeline",
                    "",
                    "| Ferramenta / Módulo | Estágio da Pipeline | Motor / Engine | Status | "
                    "Quadros Processados | Especificação Técnica da Correção |",
                    "| :--- | :--- | :--- | :---: | :---: | :--- |",
                ]
            )
            for tool in tools_reg:
                lines.append(
                    f"| **{tool.get('tool_name', tool.get('tool_id', ''))}** | `{tool.get('stage', '')}` | "
                    f"`{tool.get('engine', '')}` | **{str(tool.get('status', '')).upper()}** | "
                    f"`{tool.get('frames_affected', 0)}` | {tool.get('correction_summary', '')} |"
                )

        if telemetry:
            lines.extend(
                [
                    "",
                    "## 6. Telemetria Acumulada Frame-a-Frame",
                    f"- **Quadros Inspecionados:** `{telemetry.get('frames_analyzed', 0)}`",
                    f"- **Quadros Válidos Mantidos:** `{telemetry.get('kept_frames', 0)}`",
                    f"- **Quadros Neutralizados via TBC Frame-Hold:** `{telemetry.get('frozen_frames', 0)}`",
                    f"- **Quadros com Riscos de Óxido (Dropouts):** `{telemetry.get('dropout_frames', 0)}`",
                    f"- **Quadros com Flagging de Topo:** `{telemetry.get('flagging_frames', 0)}` "
                    f"(Pico Skew: `{telemetry.get('max_flagging_skew_px', 0.0)} px`)",
                    f"- **Quadros com Time-Base Jitter:** `{telemetry.get('jitter_frames', 0)}` "
                    f"(Pico Jitter: `{telemetry.get('max_jitter_delta_px', 0.0)} px`)",
                    f"- **Quadros com Cores Estouradas / Clipping:** `{telemetry.get('blown_out_color_frames', 0)}`",
                    f"- **Quadros com Esmagamento de Pretos (<16 IRE):** `{telemetry.get('black_crush_frames', 0)}`",
                    f"- **Quadros com Ruído Analógico Elevado:** `{telemetry.get('analog_noise_frames', 0)}`",
                ]
            )

        if events_log:
            lines.extend(
                [
                    "",
                    "## 7. Registro Cronológico Sincronizado de Falhas e Correções (Frame-Accurate)",
                    "",
                    "| ID | Categoria | Falha Técnica Detectada | Quadros (Início -> Fim) | "
                    "Timecode | Ferramenta | Ação Corretiva Sincronizada |",
                    "| :---: | :--- | :--- | :---: | :---: | :--- | :--- |",
                ]
            )
            for ev in events_log[:100]:
                lines.append(
                    f"| `{ev.get('event_id')}` | `{ev.get('category')}` | **{ev.get('defect_type')}** | "
                    f"`{ev.get('frame_start')} -> {ev.get('frame_end')}` ({ev.get('frame_count')}f) | "
                    f"`{ev.get('timecode_start')} -> {ev.get('timecode_end')}` | `{ev.get('tool_applied')}` | "
                    f"{ev.get('correction_applied')} |"
                )

        if sync_state:
            lines.extend(
                [
                    "",
                    "## 8. Estado de Sincronização de Checkpoint e Retomada",
                    f"- **Status do Documento:** `{sync_state.get('status', 'inspected')}`",
                    f"- **Último Quadro Sincronizado:** `{sync_state.get('last_synced_frame', 0)}`",
                    f"- **Timecode Sincronizado:** `{sync_state.get('last_synced_timecode', '00:00:00.000')}`",
                    f"- **Retomadas de Interrupção Registradas:** `{sync_state.get('resumed_count', 0)}`",
                ]
            )

        lines.extend(
            [
                "",
                "---",
                "*Relatório gerado automaticamente pelo módulo QualityControl do VHS Studio Pro.*",
            ]
        )

        return "\n".join(lines)

    @staticmethod
    def _sec_to_tc(seconds: float) -> str:
        """Convert float seconds to human-readable HH:MM:SS.mmm timecode string."""
        return sec_to_timecode(seconds)
