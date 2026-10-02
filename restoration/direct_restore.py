#!/usr/bin/env python3
"""
direct_restore.py - Restauração Direta Single-Pass para VHS
Mecanismo de Alta Performance:
  1. Detecta todos os intervalos de tela preta e azul (líder, pausas entre takes e trailer).
  2. Gera plano de segmentos de conteúdo útil via ffconcat demuxer.
  3. Desentrelaçamento BWDIF 60p broadcast + Upscale 1080p remasterizado em passe único.
  4. Encode direto para media/output/ (SEM intermediários de 15GB poluindo o SSD!).
"""

import sys
import os
import re
import subprocess
import argparse
import time

def get_duration(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return float(res.stdout.strip())

def detect_black_intervals(input_file, min_duration=0.40, pix_th=0.12, pic_th=0.96):
    print(f"[RESTAURAÇÃO] Analisando fita para detecção de pretos e telas azuis...", flush=True)
    vf = f"colorkey=0x0000FF:0.35:0.1,blackdetect=d={min_duration}:pix_th={pix_th}:pic_th={pic_th}"
    cmd = [
        "ffmpeg", "-hide_banner",
        "-i", input_file,
        "-vf", vf,
        "-an", "-f", "null", "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    intervals = []
    pattern = re.compile(r"black_start:([0-9.]+)\s+black_end:([0-9.]+)")
    for line in res.stderr.splitlines():
        m = pattern.search(line)
        if m:
            intervals.append((float(m.group(1)), float(m.group(2))))
    return intervals

def merge_intervals(intervals, gap_threshold=0.10):
    if not intervals:
        return []
    merged = [list(intervals[0])]
    for s, e in intervals[1:]:
        prev_s, prev_e = merged[-1]
        if s <= prev_e + gap_threshold:
            merged[-1][1] = max(prev_e, e)
        else:
            merged.append([s, e])
    return [(max(0.0, s), e) for s, e in merged]

def calculate_keep_segments(black_intervals, total_duration):
    """
    Inverte os intervalos pretos para obter os segmentos de CONTEÚDO que devem ser mantidos.
    """
    if not black_intervals:
        return [(0.0, total_duration)]

    keep = []
    current_pos = 0.0

    for s, e in black_intervals:
        if s > current_pos + 0.05:
            keep.append((current_pos, s))
        current_pos = max(current_pos, e)

    if current_pos < total_duration - 0.05:
        keep.append((current_pos, total_duration))

    return keep

def main():
    parser = argparse.ArgumentParser(description="Restauração direta single-pass para VHS")
    parser.add_argument("input", help="Arquivo raw de entrada")
    parser.add_argument("--output", default=None, help="Arquivo final de saída")
    parser.add_argument("--crf", type=int, default=18, help="Qualidade CRF (padrão: 18)")
    parser.add_argument("--preset", default="medium", help="Preset libx264 (padrão: medium)")
    parser.add_argument("--min-gap", type=float, default=0.40, help="Duração mínima do preto (padrão: 0.40s)")
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    if not os.path.exists(input_path):
        print(f"[ERRO] Arquivo não encontrado: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    output_dir = os.path.join(project_root, "media", "output")
    work_dir = os.path.join(project_root, "media", "work")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    if args.output:
        output_path = os.path.abspath(args.output)
    else:
        output_path = os.path.join(output_dir, f"{base_name}_restored_1080p.mp4")

    total_dur = get_duration(input_path)
    print(f"[RESTAURAÇÃO] Arquivo: {input_path}", flush=True)
    print(f"[RESTAURAÇÃO] Duração original: {total_dur:.2f}s ({total_dur/60:.1f} min)", flush=True)

    raw_blacks = detect_black_intervals(input_path, min_duration=args.min_gap)
    merged = merge_intervals(raw_blacks)

    total_cut = sum(e - s for s, e in merged)
    print(f"[RESTAURAÇÃO] {len(merged)} intervalos de preto/azul detectados ({total_cut:.2f}s de cortes eliminados).", flush=True)

    keep_segments = calculate_keep_segments(merged, total_dur)
    print(f"[RESTAURAÇÃO] {len(keep_segments)} segmentos de vídeo útil preservados em sincronia perfeita.", flush=True)

    # Escreve arquivo de plano ffconcat
    concat_plan_file = os.path.join(work_dir, "concat_plan.txt")
    escaped_input_path = input_path.replace("\\", "/")

    with open(concat_plan_file, "w", encoding="utf-8") as f:
        f.write("ffconcat version 1.0\n")
        for s, e in keep_segments:
            f.write(f"file '{escaped_input_path}'\n")
            f.write(f"inpoint {s:.3f}\n")
            f.write(f"outpoint {e:.3f}\n")

    # Filtro de desentrelaçamento BWDIF 60p + Upscale 1080p 4:3 pillarbox
    vf = "bwdif=mode=1:parity=auto:deint=all,scale=1440:1080:flags=lanczos,setsar=1:1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-f", "concat", "-safe", "0", "-i", concat_plan_file,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", args.preset,
        "-crf", str(args.crf),
        "-pix_fmt", "yuv420p",
        "-color_primaries", "bt470bg",
        "-color_trc", "bt470bg",
        "-colorspace", "bt470bg",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path
    ]

    print(f"[RESTAURAÇÃO] Iniciando renderização master single-pass diretamente para:", flush=True)
    print(f"              {output_path}", flush=True)
    print(f"[RESTAURAÇÃO] (Zero arquivos gigantes gerados no disco - SSD protegido!)", flush=True)

    t0 = time.time()
    res = subprocess.run(cmd)
    t1 = time.time()

    # Remove o arquivo temporário de plano de concat
    if os.path.exists(concat_plan_file):
        try:
            os.remove(concat_plan_file)
        except OSError:
            pass

    if res.returncode != 0:
        print(f"[ERRO] FFmpeg falhou com código {res.returncode}", file=sys.stderr, flush=True)
        sys.exit(res.returncode)

    if os.path.exists(output_path):
        final_size = os.path.getsize(output_path) / (1024 * 1024)
        final_dur = get_duration(output_path)
        print(f"\n============================================================", flush=True)
        print(f"[SUCESSO] Vídeo master restaurado com êxito!", flush=True)
        print(f"  Destino:     {output_path}", flush=True)
        print(f"  Tamanho:     {final_size:.1f} MB (ótima compressão)", flush=True)
        print(f"  Duração:     {final_dur:.2f}s ({final_dur/60:.1f} min)", flush=True)
        print(f"  Tempo gasto: {(t1-t0)/60:.1f} minutos", flush=True)
        print(f"============================================================", flush=True)

if __name__ == "__main__":
    main()
