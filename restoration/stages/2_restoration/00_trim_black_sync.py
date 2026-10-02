#!/usr/bin/env python3
"""
00_trim_black_sync.py
Detects black frames and trims both video and audio synchronously to eliminate
blank leaders, trailers, and gap spaces without causing audio/video desync.
"""

import sys
import os
import re
import argparse
import subprocess
import time

def get_stream_info(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "csv=p=0",
        input_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not res.stdout.strip():
        raise RuntimeError(f"ffprobe stream info falhou: {res.stderr}")
    parts = res.stdout.strip().split("\n")[0].split(",")
    width = int(parts[0])
    height = int(parts[1])
    r_frame_rate = parts[2]

    # Check audio
    cmd_a = [
        "ffprobe", "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=index",
        "-of", "csv=p=0",
        input_file
    ]
    res_a = subprocess.run(cmd_a, capture_output=True, text=True)
    has_audio = bool(res_a.stdout.strip())

    return width, height, r_frame_rate, has_audio

def get_duration(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_file
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffprobe falhou: {res.stderr}")
    return float(res.stdout.strip())

def apply_dropout_concealment(input_file, temp_output, max_conceal_sec=1.0, y_threshold=32):
    """
    Broadcast Dropout Concealment (DOC):
    Streams raw YUV420p video. When micro-dropouts or tracking losses occur (<= max_conceal_sec),
    holds the preceding valid frame. Keeps the audio stream 100% continuous and untouched,
    eliminating jarring jump-cuts and audio stutters.
    """
    width, height, r_frame_rate, has_audio = get_stream_info(input_file)
    
    # Calculate FPS
    if "/" in r_frame_rate:
        num, den = r_frame_rate.split("/")
        fps = float(num) / float(den)
    else:
        fps = float(r_frame_rate)
        
    max_conceal_frames = int(round(fps * max_conceal_sec))

    cmd_in = ["ffmpeg", "-hide_banner", "-i", input_file, "-f", "rawvideo", "-pix_fmt", "yuv420p", "-an", "pipe:1"]
    proc_in = subprocess.Popen(cmd_in, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    cmd_out = [
        "ffmpeg", "-y", "-hide_banner",
        "-f", "rawvideo", "-pix_fmt", "yuv420p",
        "-s", f"{width}x{height}", "-r", r_frame_rate,
        "-i", "pipe:0"
    ]
    if has_audio:
        cmd_out += ["-i", input_file, "-map", "0:v", "-map", "1:a", "-c:a", "pcm_s16le"]
    else:
        cmd_out += ["-map", "0:v"]

    cmd_out += ["-c:v", "ffv1", "-coder", "1", "-context", "1", temp_output]

    proc_out = subprocess.Popen(cmd_out, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

    y_size = width * height
    frame_size = y_size * 3 // 2

    last_good = None
    black_run = 0
    total_frames = 0
    concealed_frames = 0

    try:
        while True:
            data = proc_in.stdout.read(frame_size)
            if not data or len(data) < frame_size:
                break
            total_frames += 1

            # Subsample Y plane (every 64th pixel) for fast brightness check
            sample = data[:y_size:64]
            avg_y = sum(sample) / len(sample)

            if avg_y <= y_threshold:
                black_run += 1
                if last_good is not None and black_run <= max_conceal_frames:
                    proc_out.stdin.write(last_good)
                    concealed_frames += 1
                    continue
            else:
                black_run = 0
                last_good = data

            proc_out.stdin.write(data)
    finally:
        proc_in.stdout.close()
        proc_out.stdin.close()
        proc_in.wait()
        proc_out.wait()

    return total_frames, concealed_frames

def detect_black_intervals(input_file, min_duration=0.033, pix_th=0.12, pic_th=0.96):
    cmd = [
        "ffmpeg", "-hide_banner",
        "-i", input_file,
        "-vf", f"blackdetect=d={min_duration}:pix_th={pix_th}:pic_th={pic_th}",
        "-an", "-f", "null", "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    intervals = []
    pattern = re.compile(r"black_start:([0-9.]+)\s+black_end:([0-9.]+)")
    for line in res.stderr.splitlines():
        m = pattern.search(line)
        if m:
            start = max(0.0, float(m.group(1)) - 0.015)
            end = float(m.group(2)) + 0.015
            intervals.append((start, end))
    return intervals

def merge_intervals(intervals, gap_threshold=0.02):
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

def compute_keep_segments(black_intervals, total_duration, min_content_duration=0.01):
    keep = []
    current_time = 0.0
    for b_start, b_end in black_intervals:
        if b_start > current_time + min_content_duration:
            keep.append((current_time, b_start))
        current_time = b_end
    if current_time < total_duration - min_content_duration:
        keep.append((current_time, total_duration))
    return keep

def trim_video_audio_sync(input_file, output_file, keep_segments):
    _, _, _, has_audio = get_stream_info(input_file)
    filters = []
    concat_inputs = []
    for i, (start_t, end_t) in enumerate(keep_segments):
        filters.append(f"[0:v]trim=start={start_t:.4f}:end={end_t:.4f},setpts=PTS-STARTPTS[v{i}]")
        if has_audio:
            filters.append(f"[0:a]atrim=start={start_t:.4f}:end={end_t:.4f},asetpts=PTS-STARTPTS[a{i}]")
            concat_inputs.append(f"[v{i}][a{i}]")
        else:
            concat_inputs.append(f"[v{i}]")

    num_segs = len(keep_segments)
    if has_audio:
        concat_filter = "".join(concat_inputs) + f"concat=n={num_segs}:v=1:a=1[vout][aout]"
    else:
        concat_filter = "".join(concat_inputs) + f"concat=n={num_segs}:v=1:a=0[vout]"
    filters.append(concat_filter)

    filter_complex = ";".join(filters)

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-i", input_file,
        "-filter_complex", filter_complex,
        "-map", "[vout]"
    ]
    if has_audio:
        cmd += ["-map", "[aout]", "-c:a", "pcm_s16le"]
    cmd += ["-c:v", "ffv1", "-level", "3", "-coder", "1", "-context", "1", output_file]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg trim falhou: {res.stderr}")

def main():
    parser = argparse.ArgumentParser(description="Remoção e suavização inteligente de frames pretos com Dropout Concealment.")
    parser.add_argument("input", help="Arquivo de vídeo de entrada")
    parser.add_argument("output", help="Arquivo de vídeo de saída (ou diretório de destino)")
    parser.add_argument("--conceal-sec", type=float, default=1.0, help="Tempo máximo de dropout para suavizar via congelamento (padrão: 1.0s)")
    parser.add_argument("--min-duration", type=float, default=0.033, help="Duração mínima do trecho preto para detecção (padrão: 0.033s)")
    parser.add_argument("--pix-th", type=float, default=0.12, help="Limiar de brilho de pixel para preto (padrão: 0.12)")
    parser.add_argument("--pic-th", type=float, default=0.96, help="Proporção mínima da tela preta (padrão: 0.96)")

    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    if not os.path.exists(input_path):
        print(f"[ERRO] Arquivo de entrada não encontrado: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = os.path.abspath(args.output)
    if os.path.isdir(output_path) or not output_path.endswith((".mkv", ".mov", ".mp4")):
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(output_path, f"{base_name}_trimmed.mkv")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    temp_conceal = os.path.join(os.path.dirname(output_path), f"temp_doc_{os.path.basename(output_path)}")

    print(f"[DOC-SMOOTH] Analisando: {input_path}")
    total_dur = get_duration(input_path)
    print(f"[DOC-SMOOTH] Duração original: {total_dur:.3f} segundos")

    # Fase 1: Dropout Concealment (suavização dos pulos causados por dropouts analógicos)
    t0 = time.time()
    total_frames, concealed = apply_dropout_concealment(
        input_path, temp_conceal, max_conceal_sec=args.conceal_sec, y_threshold=32
    )
    dt = time.time() - t0
    fps_proc = total_frames / dt if dt > 0 else 0
    print(f"[DOC-SMOOTH] Fase 1 concluída: {concealed} frames de dropout suavizados sem cortes (vel: {fps_proc:.1f} fps).")

    # Fase 2: Detecção de pretos restantes (líderes iniciais, trailers finais ou vácuos longos de fita)
    raw_blacks = detect_black_intervals(temp_conceal, args.min_duration, args.pix_th, args.pic_th)
    merged_blacks = merge_intervals(raw_blacks)

    if not merged_blacks:
        print("[DOC-SMOOTH] Nenhum frame preto restante! Vídeo suavizado e contínuo.")
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(temp_conceal, output_path)
        print(f"[DOC-SMOOTH] Arquivo final salvo com sucesso em: {output_path}")
        sys.exit(0)

    print(f"[DOC-SMOOTH] Fase 2: {len(merged_blacks)} vácuos longos/líderes/trailers detectados para corte síncrono:")
    total_black_dur = 0.0
    for s, e in merged_blacks:
        d = e - s
        total_black_dur += d
        print(f"  - Preto a remover: {s:.3f}s até {e:.3f}s ({d:.3f}s)")

    keep_segs = compute_keep_segments(merged_blacks, total_dur)
    if not keep_segs:
        print("[AVISO] Vídeo composto inteiramente por silêncio/preto.", file=sys.stderr)
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(temp_conceal, output_path)
        sys.exit(0)

    print(f"[DOC-SMOOTH] Realizando corte síncrono dos trechos longos ({len(keep_segs)} blocos)...")
    trim_video_audio_sync(temp_conceal, output_path, keep_segs)
    if os.path.exists(temp_conceal):
        try: os.remove(temp_conceal)
        except OSError: pass

    new_dur = get_duration(output_path)
    print(f"[DOC-SMOOTH] [OK] Vídeo finalizado com áudio 100% síncrono e contínuo: {output_path}")
    print(f"[DOC-SMOOTH] Duração útil: {new_dur:.3f}s (remoção de {total_dur - new_dur:.3f}s)")

if __name__ == "__main__":
    main()

