# flake8: noqa
from vhs_studio.core.toolchain import Toolchain

#!/usr/bin/env python3
"""
vhs_common.py - Biblioteca Python unificada para o pipeline VHS Studio
Fornece inspeção técnica de streams (ffprobe/idet), detecção de frames sem sinal
(preto e azul), tratamento de caminhos cross-platform e wrappers com logs seguros.
"""

import os
import json
import subprocess
import re
from vhs_studio.core.logger import log


def probe_media(file_path):
    """
    Inspeciona profundamente o arquivo de mídia usando ffprobe e retorna metadados completos.
    """
    ffprobe = Toolchain.get_ffprobe_path()
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file_path,
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
        "format": data.get("format", {}).get("format_name", ""),
    }


def detect_interlace_status(file_path, num_frames=300, start_sec=None):
    """
    Executa o filtro 'idet' do FFmpeg sobre um segmento para determinar se
    o sinal é genuinamente entrelaçado (TFF/BFF) ou já desentrelaçado/progressivo.
    Se start_sec não for fornecido, amostra a partir de 15 segundos para evitar
    líderes pretos estáticos que resultam em detecções indeterminadas.
    """
    ffmpeg = Toolchain.get_ffmpeg_path()

    # Se start_sec não for informado, tenta buscar após o início estático
    if start_sec is None:
        try:
            meta = probe_media(file_path)
            dur = meta.get("duration", 0.0)
            start_sec = 15.0 if dur > 25.0 else 0.0
        except Exception:
            start_sec = 0.0

    cmd = [
        ffmpeg,
        "-hide_banner",
        "-ss",
        str(start_sec),
        "-i",
        file_path,
        "-vf",
        "idet",
        "-vframes",
        str(num_frames),
        "-an",
        "-f",
        "null",
        "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    stderr = res.stderr

    multi_matches = list(
        re.finditer(
            r"Multi frame detection:\s+TFF:\s*(\d+)\s+BFF:\s*(\d+)\s+Progressive:\s*(\d+)\s+Undetermined:\s*(\d+)",
            stderr,
        )
    )
    single_matches = list(
        re.finditer(
            r"Single frame detection:\s+TFF:\s*(\d+)\s+BFF:\s*(\d+)\s+Progressive:\s*(\d+)\s+Undetermined:\s*(\d+)",
            stderr,
        )
    )

    for m in reversed(multi_matches + single_matches):
        tff = int(m.group(1))
        bff = int(m.group(2))
        prog = int(m.group(3))
        undet = int(m.group(4))
        total = tff + bff + prog + undet

        if total > 0:
            # Se a grande maioria for undetermined (ex: clipe curto estático), tenta fallback no frame 0 se não foi
            if undet > total * 0.85 and start_sec > 0:
                return detect_interlace_status(file_path, num_frames=num_frames, start_sec=0.0)

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
                "summary": f"{'Interlaced (' + order.upper() + ')' if is_interlaced else 'Progressive'} ({tff} TFF, {bff} BFF, {prog} Prog, {undet} Undet)",
            }

    return {
        "detected": False,
        "is_interlaced": False,
        "preferred_order": "bff",
        "summary": "Detecção inconclusiva",
    }


def detect_audio_layout(file_path, sample_sec=15.0, sample_duration=5.0):
    """
    Analisa os níveis de volume RMS de cada canal para detectar se:
      1. Canal R está mudo/vazio (câmera mono onde R ficou desconectado -> duplicar L->R).
      2. Canal L e R já são idênticos (DMR-EH55 duplicou na placa perfeitamente -> não alterar).
      3. Canais são estéreo autênticos (VCR estéreo -> preservar estéreo).
    """
    ffmpeg = Toolchain.get_ffmpeg_path()
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-ss",
        str(sample_sec),
        "-t",
        str(sample_duration),
        "-i",
        file_path,
        "-af",
        "astats",
        "-f",
        "null",
        "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    stderr = res.stderr

    ch1_match = re.search(r"Channel: 1.*?RMS level dB:\s*(-?[\d\.]+)", stderr, re.DOTALL)
    ch2_match = re.search(r"Channel: 2.*?RMS level dB:\s*(-?[\d\.]+)", stderr, re.DOTALL)

    if ch1_match and ch2_match:
        rms1 = float(ch1_match.group(1))
        rms2 = float(ch2_match.group(1))

        # Canal 2 está mudo (abaixo de -55 dB) enquanto canal 1 tem sinal
        if rms2 < -55.0 and rms1 > -45.0:
            return {
                "detected": True,
                "layout": "mono_l",
                "rms_l": rms1,
                "rms_r": rms2,
                "recommendation": "duplicate_l_to_r",
                "reason": f"Canal R está mudo ({rms2:.1f} dB) enquanto L tem sinal ({rms1:.1f} dB). Duplicação necessária.",
            }
        # Canal 1 está mudo enquanto canal 2 tem sinal
        if rms1 < -55.0 and rms2 > -45.0:
            return {
                "detected": True,
                "layout": "mono_r",
                "rms_l": rms1,
                "rms_r": rms2,
                "recommendation": "duplicate_r_to_l",
                "reason": f"Canal L está mudo ({rms1:.1f} dB) enquanto R tem sinal ({rms2:.1f} dB).",
            }
        # Ambos os canais são praticamente idênticos (duplicação pelo hardware Panasonic DMR-EH55)
        if abs(rms1 - rms2) < 0.8 and rms1 > -50.0:
            return {
                "detected": True,
                "layout": "dual_mono",
                "rms_l": rms1,
                "rms_r": rms2,
                "recommendation": "passthrough",
                "reason": f"Canais L e R são idênticos (L: {rms1:.1f} dB, R: {rms2:.1f} dB). Placa já realizou a duplicação.",
            }
        # Canais com sinais independentes
        return {
            "detected": True,
            "layout": "stereo",
            "rms_l": rms1,
            "rms_r": rms2,
            "recommendation": "passthrough",
            "reason": f"Estéreo genuíno detectado (L: {rms1:.1f} dB, R: {rms2:.1f} dB).",
        }

    return {
        "detected": False,
        "layout": "stereo",
        "rms_l": 0.0,
        "rms_r": 0.0,
        "recommendation": "passthrough",
        "reason": "Análise de áudio inconclusiva (mantendo estéreo padrão).",
    }


def resolve_pipeline_strategy(
    meta,
    interlace_info,
    audio_info,
    user_fps=None,
    user_deint=None,
    user_audio=None,
    interactive=False,
):
    """
    Consolida as detecções técnicas com eventuais parâmetros do usuário e
    resolve a estratégia canônica à prova de falhas.
    Se houver ambiguidade no modo interativo, solicita confirmação do usuário.
    """
    raw_fps = meta.get("fps", 29.97)
    is_interlaced = interlace_info.get("is_interlaced", False)
    preferred_order = interlace_info.get("preferred_order", "bff")

    # 1. Resolução do FPS e Desentrelaçamento
    ambiguity_reasons = []

    if user_fps:
        target_fps = float(user_fps)
    elif raw_fps >= 45.0:
        # Arquivo já gravado em alta cadência (59.94p ou 60.0p)
        target_fps = raw_fps
    elif raw_fps < 35.0:
        # Arquivo em cadência padrão de fita (29.97i ou 25i)
        target_fps = (raw_fps * 2.0) if is_interlaced else raw_fps
    else:
        target_fps = raw_fps
        ambiguity_reasons.append(f"FPS incomum detectado: {raw_fps:.2f}")

    if user_deint:
        need_deinterlace = (user_deint == "force") or (user_deint == "auto" and is_interlaced)
    else:
        # Se o FPS já for >= 45.0 e o container marcar progressivo, não deve desentrelaçar
        if raw_fps >= 45.0 and not is_interlaced:
            need_deinterlace = False
        elif raw_fps < 35.0 and is_interlaced:
            need_deinterlace = True
        elif raw_fps >= 45.0 and is_interlaced:
            ambiguity_reasons.append(f"Conflito: Taxa alta ({raw_fps:.2f} fps) mas idet aponta entrelaçamento.")
            need_deinterlace = False
        else:
            need_deinterlace = is_interlaced

    # 2. Resolução do Áudio
    if user_audio:
        audio_policy = user_audio
    else:
        rec = audio_info.get("recommendation", "passthrough")
        if rec == "duplicate_l_to_r":
            audio_policy = "mono_l"
        elif rec == "duplicate_r_to_l":
            audio_policy = "mono_r"
        else:
            audio_policy = "stereo"

    # 3. Interatividade quando houver dúvida ou modo interativo ativo
    if interactive and (ambiguity_reasons or interactive == "always"):
        log.info("============================================================")
        log.info("[AUDIT / DECISÃO INTERATIVA DA PIPELINE]")
        log.info(f"  Arquivo: {meta.get('file_path')}")
        log.info(f"  FPS Nativo: {raw_fps:.3f} | Resolução: {meta.get('width')}x{meta.get('height')}")
        log.info(f"  Status idet: {interlace_info.get('summary')}")
        log.info(f"  Áudio: {audio_info.get('reason')}")
        if ambiguity_reasons:
            log.warning("  Avisos de ambiguidade:")
            for a in ambiguity_reasons:
                log.warning(f"    - {a}")
        log.info("\nComo deseja processar o vídeo?")
        log.info(
            f"  [1] Recomendado: FPS {target_fps:.3f} | Desentrelaçamento: {'Sim' if need_deinterlace else 'Não'} | Áudio: {audio_policy}"
        )
        log.info("  [2] Forçar NTSC 29.97i -> 59.94p (Double-Rate BWDIF/QTGMC)")
        log.info("  [3] Forçar Progressivo Direto (Pular desentrelaçamento, manter FPS nativo)")
        log.info("  [4] Forçar PAL 25i -> 50p")
        try:
            choice = input("Escolha uma opção [1-4] (Enter para 1): ").strip()
            if choice == "2":
                target_fps = 59.94
                need_deinterlace = True
                preferred_order = "bff"
            elif choice == "3":
                target_fps = raw_fps
                need_deinterlace = False
            elif choice == "4":
                target_fps = 50.0
                need_deinterlace = True
                preferred_order = "tff"
        except (EOFError, KeyboardInterrupt):
            pass
        log.info("============================================================\n")

    return {
        "raw_fps": raw_fps,
        "target_fps": target_fps,
        "need_deinterlace": need_deinterlace,
        "preferred_order": preferred_order,
        "audio_policy": audio_policy,
        "ambiguity": len(ambiguity_reasons) > 0,
        "ambiguity_details": ambiguity_reasons,
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
