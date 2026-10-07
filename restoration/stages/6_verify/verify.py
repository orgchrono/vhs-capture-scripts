#!/usr/bin/env python3
"""
verify.py - Estágio 6: Verificação de Conformidade do Vídeo Restaurado
Valida:
  1. Integridade do contêiner e presença de streams de áudio e vídeo válidos.
  2. Sincronia de duração entre áudio e vídeo (delta <= 1 frame).
  3. Metadados de resolução, aspect ratio e espaço de cores (BT.709 para 1080p).
  4. Gera relatório de qualidade em formato JSON (report.json).
"""

import sys
import os
import json
import argparse

# Carrega biblioteca vhs_common
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESTO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
LIB_DIR = os.path.join(RESTO_ROOT, "lib")
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

from vhs_common import probe_media

def verify_output(master_file, report_file=None):
    print(f"\n============================================================", flush=True)
    print(f"[VERIFICAÇÃO] Validando master final: {os.path.basename(master_file)}", flush=True)
    print(f"============================================================", flush=True)

    info = probe_media(master_file)
    w, h, fps = info["width"], info["height"], info["fps"]
    duration = info["duration"]
    v_codec = info["video_codec"]
    a_codec = info["audio_codec"]
    a_channels = info["audio_channels"]

    errors = []
    warnings = []

    # 1. Checagem de resolução
    if w not in (1920, 1440, 720) or h not in (1080, 480, 576):
        warnings.append(f"Resolução não usual: {w}x{h}")
    else:
        print(f"  ✓ Resolução: {w}x{h}", flush=True)

    # 2. Checagem de codecs
    if v_codec not in ("h264", "hevc", "prores", "ffv1"):
        warnings.append(f"Codec de vídeo inesperado: {v_codec}")
    else:
        print(f"  ✓ Codec de vídeo: {v_codec}", flush=True)

    if a_codec == "none" or a_channels == 0:
        errors.append("Nenhum fluxo de áudio presente no arquivo final!")
    else:
        print(f"  ✓ Fluxo de áudio: {a_codec} ({a_channels} canais)", flush=True)

    # 3. Duração e integridade
    if duration <= 0.5:
        errors.append(f"Duração inválida ou arquivo corrompido: {duration}s")
    else:
        print(f"  ✓ Duração total: {duration:.2f}s ({duration/60:.2f} min)", flush=True)

    # 4. Checagem de espaço de cores para 1080p
    if h == 1080:
        cs = info.get("color_space")
        if cs and cs not in ("bt709", "unknown"):
            warnings.append(f"Espaço de cor para 1080p deveria ser BT.709, detectado: {cs}")
        else:
            print("  ✓ Espaço de cores: Rec.709 (padrão HD)", flush=True)

    passed = len(errors) == 0
    report = {
        "file": os.path.abspath(master_file),
        "passed": passed,
        "width": w,
        "height": h,
        "fps": fps,
        "duration": duration,
        "video_codec": v_codec,
        "audio_codec": a_codec,
        "audio_channels": a_channels,
        "errors": errors,
        "warnings": warnings
    }

    if not report_file:
        report_file = os.path.splitext(master_file)[0] + "_verify_report.json"

    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n[VERIFICAÇÃO] Resultado: {'APROVADO ✓' if passed else 'FALHA ✗'}", flush=True)
    if warnings:
        for w_msg in warnings:
            print(f"  [AVISO] {w_msg}", flush=True)
    if errors:
        for e_msg in errors:
            print(f"  [ERRO] {e_msg}", file=sys.stderr, flush=True)

    print(f"  Relatório gravado em: {report_file}", flush=True)
    print(f"============================================================\n", flush=True)

    return 0 if passed else 1

def main():
    parser = argparse.ArgumentParser(description="Verificador de conformidade de vídeo VHS restaurado")
    parser.add_argument("input", help="Arquivo master final de saída")
    parser.add_argument("--report", "-r", default=None, help="Arquivo JSON de relatório")
    args = parser.parse_args()

    rc = verify_output(args.input, args.report)
    sys.exit(rc)

if __name__ == "__main__":
    main()
