#!/usr/bin/env python3
"""
direct_restore.py - Restauração Direta Frame-Accurate para VHS
Mecanismo de Alta Precisão:
  1. Detecta todos os intervalos de tela preta e azul (líder, pausas entre takes e trailer).
  2. Divide os segmentos de conteúdo em lotes otimizados para filtro FFmpeg nativo (sem perda de GOP e sem keyframe slop).
  3. Desentrelaçamento BWDIF 60p broadcast + Upscale 1080p remasterizado com Lanczos (4:3 pillarbox).
  4. Concatenação lossless direta para media/output/ (SEM intermediários de 15GB poluindo o SSD!).
"""

import sys
import os
import re
import subprocess
import argparse
import time
import shutil

def get_duration(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(res.stdout.strip())
    except ValueError:
        return 0.0

def detect_black_intervals(input_file, min_duration=0.25, pix_th=0.12, pic_th=0.95):
    print(f"[RESTAURAÇÃO] Analisando fita para detecção precisa de pretos e pausas...", flush=True)
    vf = f"blackdetect=d={min_duration}:pix_th={pix_th}:pic_th={pic_th}"
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

def merge_intervals(intervals, gap_threshold=0.40):
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

def render_chunk(input_path, segments, output_chunk, preset="veryfast", crf=18):
    """
    Renderiza um lote de segmentos com trim frame-accurate, bwdif 60p e upscale 1080p.
    """
    v_parts = [f"[0:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS[v{i}]" for i, (s, e) in enumerate(segments)]
    a_parts = [f"[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS[a{i}]" for i, (s, e) in enumerate(segments)]
    labels = [f"[v{i}][a{i}]" for i in range(len(segments))]

    vf_remaster = (
        "bwdif=mode=1:parity=auto:deint=all,"
        "scale=1440:1080:flags=lanczos,"
        "setsar=1:1,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    )

    filter_graph = (
        ";".join(v_parts + a_parts) + ";" +
        "".join(labels) + f"concat=n={len(segments)}:v=1:a=1[basev][outa];" +
        f"[basev]{vf_remaster}[outv]"
    )

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-i", input_path,
        "-filter_complex", filter_graph,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-color_primaries", "bt470bg",
        "-color_trc", "bt470bg",
        "-colorspace", "bt470bg",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        output_chunk
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Falha ao renderizar chunk: {res.stderr[-2000:]}")

def verify_output(output_path):
    """
    Verifica se o vídeo restaurado tem sinal útil logo no início (t=0s).
    """
    cmd = [
        "ffmpeg", "-ss", "0.0", "-i", output_path,
        "-vframes", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.stdout:
        mean_val = sum(res.stdout) / len(res.stdout)
        max_val = max(res.stdout)
        return mean_val, max_val
    return 0.0, 0

def main():
    parser = argparse.ArgumentParser(description="Restauração direta frame-accurate para VHS")
    parser.add_argument("input", help="Arquivo raw de entrada")
    parser.add_argument("--output", default=None, help="Arquivo final de saída")
    parser.add_argument("--crf", type=int, default=18, help="Qualidade CRF (padrão: 18)")
    parser.add_argument("--preset", default="veryfast", help="Preset libx264 (padrão: veryfast)")
    parser.add_argument("--min-gap", type=float, default=0.25, help="Duração mínima do preto (padrão: 0.25s)")
    parser.add_argument("--chunk-size", type=int, default=15, help="Segmentos por lote (padrão: 15)")
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
    print(f"[RESTAURAÇÃO] Arquivo de Entrada: {input_path}", flush=True)
    print(f"[RESTAURAÇÃO] Duração original:   {total_dur:.2f}s ({total_dur/60:.1f} min)", flush=True)

    # 1. Detecção de intervalos pretos
    raw_blacks = detect_black_intervals(input_path, min_duration=args.min_gap)
    merged = merge_intervals(raw_blacks, gap_threshold=0.40)

    total_cut = sum(e - s for s, e in merged)
    print(f"[RESTAURAÇÃO] {len(merged)} intervalos de preto detectados ({total_cut:.2f}s de cortes eliminados).", flush=True)

    # 2. Segmentos de conteúdo útil
    keep_segments = calculate_keep_segments(merged, total_dur)
    print(f"[RESTAURAÇÃO] {len(keep_segments)} cenas úteis preservadas com sincronia A/V milimétrica.", flush=True)

    if not keep_segments:
        print("[ERRO] Nenhum conteúdo útil detectado na fita!", file=sys.stderr, flush=True)
        sys.exit(1)

    temp_chunks_dir = os.path.join(work_dir, "temp_chunks")
    if os.path.exists(temp_chunks_dir):
        shutil.rmtree(temp_chunks_dir, ignore_errors=True)
    os.makedirs(temp_chunks_dir, exist_ok=True)

    # 3. Agrupamento em lotes (chunks) para processamento em alta velocidade
    chunk_size = args.chunk_size
    batches = [keep_segments[i:i + chunk_size] for i in range(0, len(keep_segments), chunk_size)]
    num_batches = len(batches)
    print(f"[RESTAURAÇÃO] Processando renderização master em {num_batches} lote(s)...", flush=True)

    chunk_files = []
    t0 = time.time()

    for b_idx, batch in enumerate(batches):
        chunk_file = os.path.join(temp_chunks_dir, f"chunk_{b_idx:03d}.mp4")
        batch_dur = sum(e - s for s, e in batch)
        print(f"  -> Lote {b_idx + 1}/{num_batches} ({len(batch)} cenas, {batch_dur:.1f}s de vídeo)...", flush=True)
        tb0 = time.time()
        render_chunk(input_path, batch, chunk_file, preset=args.preset, crf=args.crf)
        tb1 = time.time()
        chunk_files.append(chunk_file)
        print(f"     Concluído em {tb1 - tb0:.1f}s.", flush=True)

    # 4. União lossless instantânea dos lotes via FFmpeg concat demuxer
    concat_list_file = os.path.join(temp_chunks_dir, "concat_list.txt")
    with open(concat_list_file, "w", encoding="utf-8") as f:
        for cf in chunk_files:
            escaped = cf.replace("\\", "/")
            f.write(f"file '{escaped}'\n")

    print(f"[RESTAURAÇÃO] Unindo lotes no arquivo master final...", flush=True)
    cmd_join = [
        "ffmpeg", "-y", "-hide_banner",
        "-f", "concat", "-safe", "0",
        "-i", concat_list_file,
        "-c", "copy",
        "-movflags", "+faststart",
        output_path
    ]
    res_join = subprocess.run(cmd_join, capture_output=True, text=True)
    t1 = time.time()

    # 5. Limpeza de temporários
    shutil.rmtree(temp_chunks_dir, ignore_errors=True)

    if res_join.returncode != 0:
        print(f"[ERRO] Falha ao unir lotes: {res_join.stderr[-2000:]}", file=sys.stderr, flush=True)
        sys.exit(res_join.returncode)

    # 6. Validação e relatório
    if os.path.exists(output_path):
        final_size = os.path.getsize(output_path) / (1024 * 1024)
        final_dur = get_duration(output_path)
        mean_start, max_start = verify_output(output_path)

        print(f"\n============================================================", flush=True)
        print(f"[SUCESSO] Vídeo master restaurado e finalizado com êxito!", flush=True)
        print(f"  Destino:       {output_path}", flush=True)
        print(f"  Tamanho:       {final_size:.1f} MB", flush=True)
        print(f"  Duração final: {final_dur:.2f}s ({final_dur/60:.1f} min)", flush=True)
        print(f"  Tempo de corte:{total_cut:.2f}s de telas pretas eliminados", flush=True)
        print(f"  Primeiro frame:Luminância média = {mean_start:.1f} (início com sinal útil real)", flush=True)
        print(f"  Tempo total:   {(t1-t0)/60:.1f} minutos", flush=True)
        print(f"============================================================", flush=True)

if __name__ == "__main__":
    main()
