#!/usr/bin/env python3
"""
00_black_hold.py - Neutralização Inteligente de Perdas de Sinal VHS
Estratégia Profissional de TBC (Time Base Corrector):
  1. Líder inicial e Trailer final: Corta Áudio e Vídeo juntos de forma síncrona.
  2. Dropouts e Perdas de Sinal no meio da fita (Preto e Tela Azul):
     - Modo 'freeze' (Padrão): Congela o último frame válido durante o período
       sem sinal. Isso preserva a cadência temporal idêntica ao áudio e garante
       100% de sincronia labial sem nenhum desvio temporal.
     - Modo 'drop': Descarta frames sem sinal (comporta-se como corte rápido).
"""

import sys
import os
import argparse
import subprocess
import time
import json

# Carrega biblioteca vhs_common
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RESTO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
LIB_DIR = os.path.join(RESTO_ROOT, "lib")
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

from vhs_common import probe_media, is_no_signal_frame, get_ffmpeg_path

def analyze_tape_signal(input_path, max_scan_sec=None):
    """
    Analisa os quadros da fita para mapear:
      - Ponto de início da gravação útil (fim do líder preto inicial)
      - Intervalos de perdas de sinal (dropouts de preto ou tela azul)
    """
    ffmpeg = get_ffmpeg_path()
    meta = probe_media(input_path)
    w, h, fps = meta["width"], meta["height"], meta["fps"]
    frame_bytes = int(w * h * 1.5)
    y_bytes = w * h
    u_bytes = y_bytes // 4

    cmd = [ffmpeg, "-hide_banner", "-i", input_path]
    if max_scan_sec:
        cmd += ["-t", str(max_scan_sec)]
    cmd += ["-f", "rawvideo", "-pix_fmt", "yuv420p", "-"]

    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    frame_idx = 0
    consecutive_content = 0
    first_content_frame = 0
    leader_found = False

    gaps = []
    current_gap_start = None
    last_gap_type = None

    print(f"[BLACK_HOLD] Analisando fluxo de quadros ({w}x{h} @ {fps:.2f} fps)...", flush=True)

    while True:
        buf = p.stdout.read(frame_bytes)
        if not buf or len(buf) < frame_bytes:
            break

        # Amostragem de luminância e crominância
        y_sample = buf[:y_bytes:64]
        mean_y = sum(y_sample) / len(y_sample) if y_sample else 0

        # Amostra de Cb e Cr
        cb_sample = buf[y_bytes:y_bytes+u_bytes:32]
        cr_sample = buf[y_bytes+u_bytes:frame_bytes:32]
        mean_cb = sum(cb_sample) / len(cb_sample) if cb_sample else 128.0
        mean_cr = sum(cr_sample) / len(cr_sample) if cr_sample else 128.0

        no_signal, sig_type = is_no_signal_frame(mean_y, mean_cb, mean_cr)

        if not leader_found:
            if not no_signal:
                consecutive_content += 1
                if consecutive_content >= 5:
                    first_content_frame = max(0, frame_idx - 4)
                    leader_found = True
            else:
                consecutive_content = 0
        else:
            if no_signal:
                if current_gap_start is None:
                    current_gap_start = frame_idx
                    last_gap_type = sig_type
            else:
                if current_gap_start is not None:
                    gap_len = frame_idx - current_gap_start
                    gaps.append({
                        "start_frame": current_gap_start,
                        "end_frame": frame_idx - 1,
                        "length_frames": gap_len,
                        "start_sec": current_gap_start / fps,
                        "duration_sec": gap_len / fps,
                        "type": last_gap_type
                    })
                    current_gap_start = None

        frame_idx += 1

    p.stdout.close()
    p.wait()

    start_sec = first_content_frame / fps if leader_found else 0.0

    return {
        "total_frames": frame_idx,
        "fps": fps,
        "first_content_frame": first_content_frame,
        "start_sec": start_sec,
        "gaps": gaps
    }

def process_black_hold(input_path, output_path, mode="freeze", start_sec=None, dry_run=False, min_gap_sec=0.1, duration=None):
    meta = probe_media(input_path)
    w, h, fps = meta["width"], meta["height"], meta["fps"]
    frame_bytes = int(w * h * 1.5)
    y_bytes = w * h
    u_bytes = y_bytes // 4

    analysis = analyze_tape_signal(input_path, max_scan_sec=duration)
    detected_start = analysis["start_sec"]
    actual_start = start_sec if start_sec is not None else detected_start

    print(f"\n============================================================", flush=True)
    print(f"[BLACK_HOLD] Relatório de Análise da Fita", flush=True)
    print(f"  Início do conteúdo útil:    {actual_start:.3f}s (quadro {int(actual_start*fps)})", flush=True)
    print(f"  Perdas de sinal no meio:    {len(analysis['gaps'])} ocorrências detectadas", flush=True)
    for i, g in enumerate(analysis['gaps'][:10], 1):
        print(f"    - Gap #{i}: {g['start_sec']:.2f}s ({g['duration_sec']:.2f}s / {g['length_frames']} quadros) [{g['type']}]", flush=True)
    if len(analysis['gaps']) > 10:
        print(f"    ... e mais {len(analysis['gaps'])-10} ocorrências menores.", flush=True)
    print(f"============================================================\n", flush=True)

    if dry_run:
        print("[BLACK_HOLD] Modo --dry-run ativo. Nenhuma alteração foi gravada em disco.", flush=True)
        return

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    ffmpeg = get_ffmpeg_path()
    log_path = f"{output_path}.log"
    log_file = open(log_path, "w", encoding="utf-8", errors="replace")

    cmd_in = [ffmpeg, "-hide_banner"]
    if actual_start > 0.05:
        cmd_in += ["-ss", f"{actual_start:.3f}"]
    cmd_in += ["-i", input_path, "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"]

    p_in = subprocess.Popen(cmd_in, stdout=subprocess.PIPE, stderr=log_file, bufsize=16*1024*1024)

    cmd_out = [
        ffmpeg, "-y", "-hide_banner",
        "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{w}x{h}", "-r", f"{fps:.3f}", "-i", "-"
    ]
    if actual_start > 0.05:
        cmd_out += ["-ss", f"{actual_start:.3f}"]
    cmd_out += [
        "-i", input_path,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "ffv1", "-level", "3", "-g", "1", "-slices", "24", "-slicecrc", "1",
        "-c:a", "pcm_s16le",
        "-shortest", output_path
    ]

    p_out = subprocess.Popen(cmd_out, stdin=subprocess.PIPE, stderr=log_file, bufsize=16*1024*1024)

    total_frames = 0
    kept_frames = 0
    frozen_frames = 0
    dropped_frames = 0
    last_good_frame = None

    print(f"[BLACK_HOLD] Processando com política '{mode}'...", flush=True)

    while True:
        buf = p_in.stdout.read(frame_bytes)
        if not buf or len(buf) < frame_bytes:
            break

        total_frames += 1
        y_sample = buf[:y_bytes:64]
        mean_y = sum(y_sample) / len(y_sample) if y_sample else 0
        cb_sample = buf[y_bytes:y_bytes+u_bytes:32]
        cr_sample = buf[y_bytes+u_bytes:frame_bytes:32]
        mean_cb = sum(cb_sample) / len(cb_sample) if cb_sample else 128.0
        mean_cr = sum(cr_sample) / len(cr_sample) if cr_sample else 128.0

        no_sig, _ = is_no_signal_frame(mean_y, mean_cb, mean_cr)

        try:
            if no_sig:
                if mode == "freeze":
                    if last_good_frame is not None:
                        p_out.stdin.write(last_good_frame)
                        frozen_frames += 1
                    else:
                        dropped_frames += 1
                else:
                    dropped_frames += 1
            else:
                last_good_frame = buf
                kept_frames += 1
                p_out.stdin.write(buf)
        except (BrokenPipeError, OSError) as e:
            print(f"[ERRO] Pipe de saída quebrado: {e}", file=sys.stderr)
            break

    p_in.stdout.close()
    rc_in = p_in.wait()

    if p_out.stdin:
        p_out.stdin.close()
    rc_out = p_out.wait()
    log_file.close()

    if rc_in != 0 or rc_out != 0:
        print(f"[ERRO] Falha na execução do FFmpeg (in rc={rc_in}, out rc={rc_out})", file=sys.stderr)
        sys.exit(1)

    print(f"[BLACK_HOLD] Concluído! Saída gerada em: {output_path}", flush=True)
    print(f"  Quadros válidos: {kept_frames} | Congelados TBC: {frozen_frames} | Descartados: {dropped_frames}", flush=True)

def main():
    parser = argparse.ArgumentParser(description="Neutralização inteligente de perdas de sinal VHS")
    parser.add_argument("input", nargs="?", default=None, help="Arquivo de vídeo de entrada")
    parser.add_argument("--in", "--input", "-i", dest="input_flag", default=None, help="Arquivo de entrada alternativo")
    parser.add_argument("--output", "-o", default=None, help="Arquivo MKV de saída")
    parser.add_argument("--mode", choices=["freeze", "drop"], default="freeze", help="Modo de neutralização")
    parser.add_argument("--start-sec", type=float, default=None, help="Segundo inicial explícito")
    parser.add_argument("--duration", "-t", type=float, default=None, help="Duração máxima em segundos a analisar")
    parser.add_argument("--dry-run", action="store_true", help="Apenas analisar sem gravar arquivo")
    args = parser.parse_args()

    raw_input = args.input_flag or args.input
    if not raw_input:
        parser.error("É necessário fornecer o arquivo de entrada (posicional ou via --in)")

    input_path = os.path.abspath(raw_input)
    if not os.path.exists(input_path):
        print(f"[ERRO] Arquivo não encontrado: {input_path}", file=sys.stderr)
        sys.exit(1)

    if not args.output:
        base = os.path.splitext(os.path.basename(input_path))[0]
        work_dir = os.path.abspath(os.path.join(RESTO_ROOT, "..", "media", "work", "stage_2"))
        output_path = os.path.join(work_dir, f"{base}_black_hold.mkv")
    else:
        output_path = os.path.abspath(args.output)

    process_black_hold(input_path, output_path, mode=args.mode, start_sec=args.start_sec, dry_run=args.dry_run, duration=args.duration)

if __name__ == "__main__":
    main()
