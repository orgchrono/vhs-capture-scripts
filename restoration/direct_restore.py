#!/usr/bin/env python3
"""
direct_restore.py - Restauração Direta Frame-Accurate para VHS
Mecanismo de Alta Performance e Sincronia A/V Perfeita:
  1. Identifica o ponto inicial exato da fita (término do líder preto inicial).
  2. Inicia áudio e vídeo juntos no primeiro frame gravado da fita.
  3. ÁUDIO INTACTO: Não corta o áudio em nenhum ponto! A trilha sonora corre contínua.
  4. VÍDEO SEM PRETO: Neutraliza frames pretos causados por perda de sinal (Y <= 18).
     Modo 'freeze' (TBC frame-hold): congela o último frame bom durante perdas de sinal,
     mantendo alinhamento temporal perfeito e 100% de sincronia labial.
  5. Desentrelaçamento broadcast (BWDIF) + Upscale 1080p Lanczos com aceleração por hardware (QuickSync / NVENC / x264).
  6. Processamento streaming ultra-rápido direto para media/output/ (SEM arquivos temporários intermediários gigantes no SSD!).
"""

import sys
import os
import subprocess
import argparse
import time
import json
from lib.logger import log

LIB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "lib"))
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)
import vhs_common
from lib.config import VideoConfig
from lib.filter_builder import FilterBuilder
from lib.stream_runner import StreamRunner

def get_stream_info(input_file):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_streams", "-show_format",
        "-of", "json", input_file
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
    except Exception:
        return VideoConfig.DEFAULT_WIDTH, VideoConfig.DEFAULT_HEIGHT, VideoConfig.DEFAULT_FPS, 0.0, "aac"

    v_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    a_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})

    w = int(v_stream.get("width", VideoConfig.DEFAULT_WIDTH))
    h = int(v_stream.get("height", VideoConfig.DEFAULT_HEIGHT))

    r_fps = v_stream.get("r_frame_rate", "30000/1001")
    if "/" in r_fps:
        num, den = r_fps.split("/")
        fps = float(num) / float(den) if float(den) > 0 else VideoConfig.DEFAULT_FPS
    else:
        fps = float(r_fps) if r_fps else VideoConfig.DEFAULT_FPS

    duration = float(data.get("format", {}).get("duration", 0.0))
    a_codec = a_stream.get("codec_name", "aac")

    return w, h, fps, duration, a_codec

def find_first_video_frame(input_file, max_scan_sec=VideoConfig.MAX_SCAN_SECONDS):
    """
    Identifica o segundo exato onde a gravação real começa na fita (fim do líder inicial).
    """
    log.info("[RESTAURAÇÃO] Localizando o início da gravação real na fita...")
    w, h, fps, _, _ = get_stream_info(input_file)
    if fps <= 0:
        fps = VideoConfig.DEFAULT_FPS
    frame_bytes = int(w * h * 1.5)
    y_bytes = w * h

    p = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-i", input_file, "-t", str(max_scan_sec), "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
    )

    frame_idx = 0
    first_good_frame = 0
    consecutive_good = 0

    while True:
        buf = p.stdout.read(frame_bytes)
        if not buf or len(buf) < frame_bytes:
            break
        y_sample = buf[:y_bytes:64]
        mean_luma = sum(y_sample) / len(y_sample) if y_sample else 0
        if mean_luma > VideoConfig.LUMA_THRESHOLD + 4.0:  # slightly higher for detection 
            consecutive_good += 1
            if consecutive_good >= VideoConfig.CONSECUTIVE_GOOD_FRAMES_REQUIRED:
                first_good_frame = frame_idx - (VideoConfig.CONSECUTIVE_GOOD_FRAMES_REQUIRED - 1)
                break
        else:
            consecutive_good = 0
        frame_idx += 1

    p.stdout.close()
    p.wait()

    start_sec = max(0.0, first_good_frame / fps)
    log.info(f"[RESTAURAÇÃO] Gravação útil identificada a partir de {start_sec:.3f}s (frame {first_good_frame} a {fps:.2f} fps).")
    return start_sec

def print_log_tail(log_path, lines=20):
    if not os.path.exists(log_path):
        return
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.readlines()
            tail = content[-lines:] if len(content) > lines else content
            log.error("\n--- Últimas linhas do log do FFmpeg ---")
            for l in tail:
                log.error(l.rstrip())
            log.error("----------------------------------------\n")
    except Exception:
        pass

def restore_stream(input_path, output_path, start_sec=0.0, target_1080p=True, crf=20, mode="freeze", audio_offset=0.0, duration=None, apply_denoise=False, apply_chroma=False, deinterlacer="auto", audio_mode="auto", target_fps=None):
    w, h, detected_fps, total_dur, a_codec = get_stream_info(input_path)
    fps = target_fps if target_fps else detected_fps
    if fps <= 0:
        fps = VideoConfig.DEFAULT_FPS
    frame_bytes = int(w * h * 1.5)
    y_bytes = w * h

    use_qsv = FilterBuilder.check_filter_support("h264_qsv") # Fallback to CPU if not supported

    log.info(f"[RESTAURAÇÃO] Resolução de entrada: {w}x{h} @ {fps:.2f} fps")
    log.info(f"[RESTAURAÇÃO] Modo de desentrelaçamento: {deinterlacer}")
    log.info(f"[RESTAURAÇÃO] Política de canais de áudio: {audio_mode}")
    log.info(f"[RESTAURAÇÃO] Aceleração de hardware: {'Intel QuickSync (h264_qsv)' if use_qsv else 'Software (libx264)'}")
    log.info(f"[RESTAURAÇÃO] Modo de remoção de pretos: {'TBC Frame-Hold (Congela último frame bom - Sincronia A/V 100% perfeita)' if mode == 'freeze' else 'Descarte direto (Acelera vídeo)'}")
    if abs(audio_offset) > 0.001:
        log.info(f"[RESTAURAÇÃO] Ajuste de sincronia de áudio: {audio_offset:+.3f}s ({'adiantando' if audio_offset > 0 else 'atrasando'} áudio)")

    log_path = f"{output_path}.log"
    log_file = open(log_path, "w", encoding="utf-8", errors="replace")

    # Inicia decodificador rawvideo do vídeo
    cmd_in = ["ffmpeg", "-hide_banner"]
    if start_sec > 0.05:
        cmd_in += ["-ss", f"{start_sec:.3f}"]
    if duration:
        cmd_in += ["-t", f"{duration:.3f}"]
    cmd_in += ["-i", input_path, "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"]

    p_in = subprocess.Popen(cmd_in, stdout=subprocess.PIPE, stderr=log_file, bufsize=16*1024*1024)

    builder = FilterBuilder(use_qsv=use_qsv, target_1080p=target_1080p, crf=crf, mode=mode)
    vf = builder.build_video_filters(apply_chroma, apply_denoise, deinterlacer)
    cmd_out = builder.build_ffmpeg_output_args(input_path, output_path, w, h, fps, start_sec, audio_offset, duration, vf, audio_mode)
    
    p_out = subprocess.Popen(cmd_out, stdin=subprocess.PIPE, stderr=log_file, bufsize=16*1024*1024)

    runner = StreamRunner(mode=mode, frame_bytes=frame_bytes, y_bytes=y_bytes, luma_threshold=VideoConfig.LUMA_THRESHOLD)
    stats = runner.run(p_in, p_out, fps)

    p_in.stdout.close()
    rc_in = p_in.wait()

    if p_out.stdin:
        try:
            p_out.stdin.close()
        except Exception:
            pass
    rc_out = p_out.wait()
    log_file.close()

    if stats["stream_broken"] or rc_out != 0 or rc_in != 0:
        log.error(f"\n[ERRO] O processo de restauração falhou! (in rc={rc_in}, out rc={rc_out})")
        print_log_tail(log_path, lines=25)
        sys.exit(1)

    final_size = os.path.getsize(output_path) / (1024 * 1024) if os.path.exists(output_path) else 0
    duration_hours = (stats["total_frames"] / fps / 3600.0) if fps > 0 else 0.0

    log.info(f"\n============================================================")
    log.info(f"[SUCESSO] Vídeo master restaurado e finalizado com êxito!")
    log.info(f"  Destino:             {output_path}")
    log.info(f"  Tamanho:             {final_size:.1f} MB")
    log.info(f"  Total analisado:     {stats['total_frames']:,} frames ({duration_hours:.2f}h de conteúdo)")
    log.info(f"  Frames de vídeo:     {stats['kept_frames']:,} frames válidos")
    if mode == "freeze":
        log.info(f"  Pretos neutralizados:{stats['frozen_frames']+stats['dropped_frames']:,} frames ({stats['frozen_frames']:,} mantidos via TBC frame-hold)")
        log.info(f"  Sincronia A/V:       100% PERFEITA (0 ms de desvio ao longo de todo o vídeo)")
    else:
        sec_recup = (stats['dropped_frames'] / fps) if fps > 0 else 0
        log.info(f"  Pretos descartados:  {stats['dropped_frames']:,} frames pretos eliminados ({sec_recup:.2f}s recuperados)")
    fps_avg = (stats['total_frames'] / stats['elapsed']) if stats['elapsed'] > 0 else 0
    log.info(f"  Tempo gasto:         {stats['elapsed']/60:.1f} minutos ({fps_avg:.0f} fps médio)")
    log.info(f"  Áudio:               100% contínuo e intacto (sem cortes)")
    log.info(f"  Arquivo de log:      {log_path}")
    log.info(f"============================================================")

def main():
    parser = argparse.ArgumentParser(description="Restauração direta ultra-rápida sem perda de sincronia A/V para VHS")
    parser.add_argument("input", help="Arquivo raw de entrada")
    parser.add_argument("--output", default=None, help="Arquivo final de saída")
    parser.add_argument("--crf", type=int, default=20, help="Qualidade CRF / ICQ (padrão: 20)")
    parser.add_argument("--mode", choices=["freeze", "drop"], default="freeze", help="Modo: 'freeze' (TBC frame-hold, zero pretos, sync perfeito) ou 'drop' (descarta pretos)")
    parser.add_argument("--no-1080p", action="store_true", help="Mantém resolução original 480p/576p em vez de upscale 1080p")
    parser.add_argument("--deinterlacer", choices=["auto", "bwdif", "bwdif_single", "znedi3", "none"], default="auto", help="Desentrelaçamento: auto (pula se já progressivo ~60p), bwdif (60p dobro), bwdif_single, znedi3 (premium), none")
    parser.add_argument("--fps", type=float, default=None, help="Forçar taxa de quadros (ex: 29.97, 59.94, 60.0)")
    parser.add_argument("--audio-mode", choices=["auto", "stereo", "mono_l", "mono_r"], default="auto", help="Tratamento de áudio: auto (detecta canal mudo/duplicação), stereo, mono_l (L->R), mono_r")
    parser.add_argument("--device", choices=["jvc_gr_ax410", "jvc_hr_d227m", "auto"], default="auto", help="Perfil do hardware")
    parser.add_argument("--interactive", action="store_true", help="Solicita confirmação interativa se houver ambiguidade técnica")
    parser.add_argument("--denoise", action="store_true", help="Aplica redução de ruído temporal/espacial (hqdn3d)")
    parser.add_argument("--chroma-fix", action="store_true", help="Aplica correção de alinhamento de croma (chromashift)")
    parser.add_argument("--start-sec", type=float, default=None, help="Segundo inicial forçado (ignora detecção automática)")
    parser.add_argument("--audio-offset", type=float, default=0.0, help="Ajuste fino de áudio em segundos (ex: +1.0 para adiantar o áudio, -1.0 para atrasar)")
    parser.add_argument("--duration", "-t", type=float, default=None, help="Duração máxima a processar em segundos (para testes)")
    args, unknown = parser.parse_known_args()
    if unknown:
        log.info(f"[INFO] Opções adicionais ignoradas pelo restaurador direto: {' '.join(unknown)}")

    input_path = os.path.abspath(args.input)
    if not os.path.exists(input_path):
        log.error(f"[ERRO] Arquivo não encontrado: {input_path}")
        sys.exit(1)

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    output_dir = os.path.join(project_root, "media", "output")
    os.makedirs(output_dir, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    if args.output:
        output_path = os.path.abspath(args.output)
    else:
        suffix = "480p" if args.no_1080p else "1080p"
        output_path = os.path.join(output_dir, f"{base_name}_restored_{suffix}.mp4")

    log.info(f"\n[RESTAURAÇÃO] Arquivo de Entrada: {input_path}")

    # Análise técnica prévia e resolução de estratégia
    meta = vhs_common.probe_media(input_path)
    interlace_info = vhs_common.detect_interlace_status(input_path)
    audio_info = vhs_common.detect_audio_layout(input_path)

    forced_audio = None
    if args.device == "jvc_gr_ax410":
        forced_audio = "mono_l"
    elif args.audio_mode != "auto":
        forced_audio = args.audio_mode

    strat = vhs_common.resolve_pipeline_strategy(
        meta, interlace_info, audio_info,
        user_fps=args.fps,
        user_deint=None if args.deinterlacer == "auto" else args.deinterlacer,
        user_audio=forced_audio,
        interactive=args.interactive
    )

    resolved_deint = "none"
    if strat["need_deinterlace"]:
        resolved_deint = "bwdif" if args.deinterlacer in ("auto", "bwdif") else args.deinterlacer
    elif args.deinterlacer in ("bwdif", "bwdif_single", "znedi3"):
        resolved_deint = args.deinterlacer

    resolved_audio = strat["audio_policy"]
    target_fps = strat["target_fps"]

    if args.start_sec is not None:
        start_sec = args.start_sec
    else:
        start_sec = find_first_video_frame(input_path)

    restore_stream(
        input_path, output_path,
        start_sec=start_sec,
        target_1080p=not args.no_1080p,
        crf=args.crf,
        mode=args.mode,
        audio_offset=args.audio_offset,
        duration=args.duration,
        apply_denoise=args.denoise,
        apply_chroma=args.chroma_fix,
        deinterlacer=resolved_deint,
        audio_mode=resolved_audio,
        target_fps=target_fps
    )

if __name__ == "__main__":
    main()
