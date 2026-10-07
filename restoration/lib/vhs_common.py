#!/usr/bin/env python3
"""
vhs_common.py - Biblioteca Python unificada para o pipeline VHS Studio
Fornece inspeção técnica de streams (ffprobe/idet), detecção de frames sem sinal
(preto e azul), tratamento de caminhos cross-platform e wrappers com logs seguros.
"""

import sys
import os
import json
import subprocess
import time
import re

def get_ffprobe_path():
    """Localiza o binário ffprobe disponível no sistema."""
    winget_path = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffprobe.exe")
    if os.path.exists(winget_path):
        return winget_path
    return "ffprobe"

def get_ffmpeg_path():
    """Localiza o binário ffmpeg disponível no sistema."""
    winget_path = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe")
    if os.path.exists(winget_path):
        return winget_path
    return "ffmpeg"

def probe_media(file_path):
    """
    Inspeciona profundamente o arquivo de mídia usando ffprobe e retorna metadados completos.
    """
    ffprobe = get_ffprobe_path()
    cmd = [
        ffprobe, "-v", "error",
        "-show_streams", "-show_format",
        "-of", "json", file_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe falhou ao inspecionar '{file_path}': {res.stderr.strip()}")

    data = json.loads(res.stdout)
    v_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    a_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})

    w = int(v_stream.get("width", 720))
    h = int(v_stream.get("height", 480))

    r_fps = v_stream.get("r_frame_rate", "30000/1001")
    if "/" in r_fps:
        num, den = r_fps.split("/")
        fps = float(num) / float(den) if float(den) > 0 else 29.97
    else:
        fps = float(r_fps) if r_fps else 29.97

    duration = float(data.get("format", {}).get("duration", 0.0))
    if duration == 0.0 and "duration" in v_stream:
        duration = float(v_stream.get("duration", 0.0))

    v_codec = v_stream.get("codec_name", "unknown")
    a_codec = a_stream.get("codec_name", "none")
    a_channels = int(a_stream.get("channels", 2)) if a_stream else 0
    a_sample_rate = int(a_stream.get("sample_rate", 48000)) if a_stream else 0

    field_order = v_stream.get("field_order", "unknown")

    return {
        "file_path": file_path,
        "width": w,
        "height": h,
        "fps": fps,
        "fps_rational": r_fps,
        "duration": duration,
        "video_codec": v_codec,
        "audio_codec": a_codec,
        "audio_channels": a_channels,
        "audio_sample_rate": a_sample_rate,
        "field_order": field_order,
        "pix_fmt": v_stream.get("pix_fmt", "yuv420p"),
        "color_space": v_stream.get("color_space", "smpte170m"),
        "color_primaries": v_stream.get("color_primaries", "smpte170m"),
        "color_transfer": v_stream.get("color_transfer", "smpte170m"),
        "format": data.get("format", {}).get("format_name", "")
    }

def detect_interlace_status(file_path, num_frames=300):
    """
    Executa o filtro 'idet' do FFmpeg sobre um segmento para determinar se
    o sinal é genuinamente entrelaçado (TFF/BFF) ou já desentrelaçado/progressivo.
    """
    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg, "-hide_banner",
        "-i", file_path,
        "-vf", f"idet",
        "-vframes", str(num_frames),
        "-an", "-f", "null", "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    stderr = res.stderr

    # Busca padrão: Multi frame detection: TFF: x BFF: y Progressive: z Undetermined: w
    m = re.search(r"Multi frame detection:\s+TFF:\s*(\d+)\s+BFF:\s*(\d+)\s+Progressive:\s*(\d+)\s+Undetermined:\s*(\d+)", stderr)
    if not m:
        # Busca alternativa para Single frame detection
        m = re.search(r"Single frame detection:\s+TFF:\s*(\d+)\s+BFF:\s*(\d+)\s+Progressive:\s*(\d+)\s+Undetermined:\s*(\d+)", stderr)

    if m:
        tff = int(m.group(1))
        bff = int(m.group(2))
        prog = int(m.group(3))
        undet = int(m.group(4))
        total = tff + bff + prog + undet

        if total > 0:
            is_interlaced = (tff + bff) > prog
            order = "bff" if bff >= tff else "tff"
            return {
                "detected": True,
                "is_interlaced": is_interlaced,
                "preferred_order": order,
                "tff_count": tff,
                "bff_count": bff,
                "progressive_count": prog,
                "undetermined_count": undet,
                "summary": f"{'Interlaced (' + order.upper() + ')' if is_interlaced else 'Progressive'} ({tff} TFF, {bff} BFF, {prog} Prog)"
            }

    return {
        "detected": False,
        "is_interlaced": True,
        "preferred_order": "bff",
        "summary": "Detecção inconclusiva (assumindo entrelaçado BFF por segurança)"
    }

def is_no_signal_frame(mean_luma, mean_cb=128.0, mean_cr=128.0):
    """
    Retorna True se o frame corresponder a:
      1. Preto de perda de sinal analógico / líder de fita: Y <= 18.0
      2. Tela azul gerada por VCR / TBC Panasonic em ausência de sincronismo:
         Luma entre 20 e 80, Cb saturado alto (>= 165) e Cr baixo (<= 115).
    """
    if mean_luma <= 18.0:
        return True, "black"
    if 20.0 <= mean_luma <= 85.0 and mean_cb >= 165.0 and mean_cr <= 115.0:
        return True, "blue_screen"
    return False, "normal"

def write_manifest(manifest_path, data):
    """Grava o manifesto de sessão em formato JSON formatado."""
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def read_manifest(manifest_path):
    """Lê o manifesto JSON se existir."""
    if not os.path.exists(manifest_path):
        return None
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)
