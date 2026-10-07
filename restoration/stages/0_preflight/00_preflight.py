#!/usr/bin/env python3
"""
00_preflight.py - Estágio 0: Inspeção Prévia e Geração de Manifesto Técnico
Inspeciona o arquivo bruto recém-capturado, detecta o padrão de vídeo (NTSC/PAL),
ordem de campos (TFF/BFF/Progressivo), mapeamento de áudio (mono/estéreo)
e gera um manifesto JSON determinístico para orientar todos os estágios do pipeline.
"""

import sys
import os
import argparse
import json

# Adiciona restoration/lib ao sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESTO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
LIB_DIR = os.path.join(RESTO_ROOT, "lib")
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

from vhs_common import probe_media, detect_interlace_status, detect_audio_layout, resolve_pipeline_strategy, write_manifest

def run_preflight(input_file, output_manifest=None, device_id=None, standard_override=None):
    print(f"\n============================================================", flush=True)
    print(f"[PREFLIGHT] Inspecionando mídia de entrada: {os.path.basename(input_file)}", flush=True)
    print(f"============================================================", flush=True)

    info = probe_media(input_file)
    print(f"  Resolução detectada: {info['width']}x{info['height']}", flush=True)
    print(f"  Taxa de quadros:     {info['fps']:.3f} fps (r={info['fps_rational']})", flush=True)
    print(f"  Codec de vídeo:      {info['video_codec']} ({info['pix_fmt']})", flush=True)
    print(f"  Codec de áudio:      {info['audio_codec']} ({info['audio_channels']} canais @ {info['audio_sample_rate']} Hz)", flush=True)
    print(f"  Duração total:       {info['duration']:.2f} segundos ({info['duration']/60:.2f} min)", flush=True)

    # Detecção do padrão NTSC vs PAL
    if standard_override in ("ntsc", "pal"):
        standard = standard_override
    else:
        # Heurística: se framerate próximo de 29.97 ou 59.94, ou altura <= 486 => NTSC
        if info["fps"] > 27.0 or info["height"] <= 486:
            standard = "ntsc"
        else:
            standard = "pal"

    # Verificação de VBI extra (ex: 486 linhas da Blackmagic Intensity)
    needs_vbi_crop = (info["height"] == 486)
    target_height = 480 if standard == "ntsc" else 576

    # Análise de entrelaçamento via idet com amostragem inteligente
    print("\n[PREFLIGHT] Analisando entrelaçamento de sinal (filtro idet)...", flush=True)
    idet_result = detect_interlace_status(input_file, num_frames=300)
    print(f"  Diagnóstico de campo: {idet_result['summary']}", flush=True)

    # Análise de canais de áudio via astats
    print("\n[PREFLIGHT] Analisando equilíbrio de canais de áudio...", flush=True)
    audio_layout = detect_audio_layout(input_file)
    print(f"  Diagnóstico de áudio: {audio_layout['reason']}", flush=True)

    # Resolução de estratégia unificada
    strategy = resolve_pipeline_strategy(
        info, idet_result, audio_layout,
        user_fps=None,
        user_deint=None,
        user_audio="mono_l" if device_id == "jvc_gr_ax410" else None
    )

    needs_deinterlace = strategy["need_deinterlace"]
    if not needs_deinterlace:
        print("  [AVISO] O vídeo já se encontra em formato PROGRESSIVO (~60p/50p). O desentrelaçamento será ignorado.", flush=True)

    audio_policy = strategy["audio_policy"]
    if audio_policy == "mono_l":
        print("  [ÁUDIO] Duplicação de canal mono L para L+R ativada.", flush=True)
    else:
        print("  [ÁUDIO] Áudio mantido sem alterações na distribuição de canais.", flush=True)

    # Cores
    color_matrix_in = "smpte170m" if standard == "ntsc" else "bt470bg"
    color_matrix_out = "bt709"

    manifest = {
        "input_file": os.path.abspath(input_file),
        "standard": standard,
        "width": info["width"],
        "height": info["height"],
        "target_active_height": target_height,
        "needs_vbi_crop": needs_vbi_crop,
        "fps": info["fps"],
        "target_fps": strategy["target_fps"],
        "fps_rational": info["fps_rational"],
        "duration": info["duration"],
        "video_codec": info["video_codec"],
        "audio_codec": info["audio_codec"],
        "audio_channels": info["audio_channels"],
        "audio_sample_rate": info["audio_sample_rate"],
        "audio_policy": audio_policy,
        "is_interlaced": idet_result["is_interlaced"],
        "field_order": idet_result["preferred_order"],
        "needs_deinterlace": needs_deinterlace,
        "recommended_deinterlacer": "bwdif",
        "color_in": color_matrix_in,
        "color_out": color_matrix_out,
        "device_profile": device_id or "default",
        "timestamp": int(sys.version_info[0])
    }

    if not output_manifest:
        proj_root = os.path.abspath(os.path.join(RESTO_ROOT, ".."))
        output_manifest = os.path.join(proj_root, "media", "work", "manifest.json")

    write_manifest(output_manifest, manifest)
    print(f"\n[PREFLIGHT] Manifesto técnico gravado em: {output_manifest}", flush=True)
    print(f"============================================================\n", flush=True)
    return manifest

def main():
    parser = argparse.ArgumentParser(description="Preflight: Inspeção e geração de manifesto VHS")
    parser.add_argument("input", help="Arquivo raw capturado de entrada")
    parser.add_argument("--output-manifest", "-o", default=None, help="Caminho do manifest.json de saída")
    parser.add_argument("--device", choices=["jvc_gr_ax410", "jvc_hr_d227m", "auto"], default="auto", help="Perfil do dispositivo de reprodução")
    parser.add_argument("--standard", choices=["ntsc", "pal", "auto"], default="auto", help="Forçar padrão NTSC ou PAL")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    if not os.path.exists(input_path):
        print(f"[ERRO] Arquivo de entrada não existe: {input_path}", file=sys.stderr)
        sys.exit(1)

    run_preflight(
        input_file=input_path,
        output_manifest=args.output_manifest,
        device_id=None if args.device == "auto" else args.device,
        standard_override=None if args.standard == "auto" else args.standard
    )

if __name__ == "__main__":
    main()
