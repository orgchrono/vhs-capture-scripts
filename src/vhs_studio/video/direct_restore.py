# flake8: noqa
from vhs_studio.core.jobs import JobManager

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
import os
import subprocess
import argparse
import json

from vhs_studio.core.logger import log
from vhs_studio.core import vhs_common
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.config.settings import VideoConfig
from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.stream_runner import StreamRunner
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC


def get_stream_info(input_file):
    cmd = [
        Toolchain.get_ffprobe_path(),
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        input_file,
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
    except Exception:
        return (
            VideoConfig.DEFAULT_WIDTH,
            VideoConfig.DEFAULT_HEIGHT,
            VideoConfig.DEFAULT_FPS,
            0.0,
            "aac",
        )

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

    args.duration = float(data.get("format", {}).get("args.duration", 0.0))
    a_codec = a_stream.get("codec_name", "aac")

    return w, h, fps, args.duration, a_codec


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
        [
            Toolchain.get_ffmpeg_path(),
            "-hide_banner",
            "-i",
            input_file,
            "-t",
            str(max_scan_sec),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "yuv420p",
            "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
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

    args.start_sec = max(0.0, first_good_frame / fps)
    log.info(
        f"[RESTAURAÇÃO] Gravação útil identificada a partir de {args.start_sec:.3f}s (frame {first_good_frame} a {fps:.2f} fps)."
    )
    return args.start_sec


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


def restore_stream(args):
    w, h, detected_fps, total_dur, a_codec = get_stream_info(args.input_path)
    fps = args.target_fps if args.target_fps else detected_fps
    if fps <= 0:
        fps = VideoConfig.DEFAULT_FPS
    frame_bytes = int(w * h * 1.5)
    y_bytes = w * h

    builder = FilterBuilder(
        target_1080p=args.target_1080p,
        crf=args.crf,
        mode=args.mode,
        output_codec=args.output_codec,
    )

    log.info(f"[RESTAURAÇÃO] Resolução de entrada: {w}x{h} @ {fps:.2f} fps")
    log.info(f"[RESTAURAÇÃO] Modo de desentrelaçamento: {args.deinterlacer}")
    log.info(f"[RESTAURAÇÃO] Política de canais de áudio: {args.audio_mode}")
    log.info(f"[RESTAURAÇÃO] Aceleração de hardware/Encoder: {builder.encoder}")
    mode_desc = {
        "freeze": "TBC Frame-Hold (Congela último frame bom para manter sincronia constante)",
        "drop": "Descarte direto (Acelera vídeo)",
        "passthrough": "Passthrough Puro (Sem alteração de frames, bit-perfect para uso com TBC Hardware)",
    }.get(args.mode, args.mode)
    log.info(f"[RESTAURAÇÃO] Modo de remoção de pretos: {mode_desc}")
    if args.apply_comb_filter:
        log.info(f"[RESTAURAÇÃO] Filtro 3D Comb ativado")
    if abs(args.audio_offset) > 0.001:
        log.info(
            f"[RESTAURAÇÃO] Ajuste de sincronia de áudio: {args.audio_offset:+.3f}s ({'adiantando' if args.audio_offset > 0 else 'atrasando'} áudio)"
        )

    log_path = f"{args.output_path}.log"
    log_file = open(log_path, "w", encoding="utf-8", errors="replace")

    # Inicia decodificador rawvideo do vídeo
    cmd_in = [Toolchain.get_ffmpeg_path(), "-hide_banner"]
    if args.start_sec > 0.05:
        cmd_in += ["-ss", f"{args.start_sec:.3f}"]
    if args.duration:
        cmd_in += ["-t", f"{args.duration:.3f}"]
    cmd_in += [
        "-i",
        args.input_path,
        "-r",
        f"{detected_fps:.3f}",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "yuv420p",
        "-",
    ]

    p_in = subprocess.Popen(cmd_in, stdout=subprocess.PIPE, stderr=log_file, bufsize=16 * 1024 * 1024)

    vf = builder.build_video_filters(
        args.apply_chroma,
        args.apply_denoise,
        args.deinterlacer,
        apply_comb_filter=args.apply_comb_filter,
        overscan_blanking=args.apply_overscan_blanking,
    )

    from vhs_studio.core.atomic_io import AtomicIO

    # Hash of params
    params_dict = {
        "w": w,
        "h": h,
        "fps": detected_fps,
        "start": args.start_sec,
        "args.mode": args.mode,
        "args.crf": args.crf,
        "vf": vf,
        "codec": args.output_codec,
    }
    phash = AtomicIO.generate_hash(params_dict)

    # Insert hash before extension
    base, ext = os.path.splitext(args.output_path)
    final_output_path = f"{base}_{phash}{ext}"
    part_path = AtomicIO.get_part_path(final_output_path)

    # IMPORTANTE (T-1.11): Passamos detected_fps (input_rate) em vez de args.target_fps
    cmd_out = builder.build_ffmpeg_output_args(
        args.input_path,
        part_path,
        w,
        h,
        detected_fps,
        args.start_sec,
        args.audio_offset,
        args.duration,
        vf,
        args.audio_mode,
        audio_treatment=args.apply_audio_treatment,
    )

    p_out = subprocess.Popen(cmd_out, stdin=subprocess.PIPE, stderr=log_file, bufsize=16 * 1024 * 1024)

    runner = StreamRunner(
        mode=args.mode,
        frame_bytes=frame_bytes,
        y_bytes=y_bytes,
        luma_threshold=VideoConfig.LUMA_THRESHOLD,
    )
    stats = runner.run(p_in, p_out, detected_fps)

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
        if os.path.exists(part_path):
            os.remove(part_path)
        try:
            JobManager.release_lock()
        except:
            pass
        sys.exit(1)

    final_size_bytes = os.path.getsize(final_output_path) if os.path.exists(final_output_path) else 0
    final_size_mb = final_size_bytes / (1024 * 1024)
    if final_size_mb >= 1000:
        size_str = f"{final_size_mb / 1024:.1f} GB"
    else:
        size_str = f"{final_size_mb:.1f} MB"
    duration_hours = (stats["total_frames"] / fps / 3600.0) if fps > 0 else 0.0

    log.info(f"\n============================================================")
    log.info(f"[SUCESSO] Vídeo master restaurado e finalizado com êxito!")
    log.info(f"  Destino:             {args.output_path}")
    log.info(f"  Tamanho:             {size_str}")
    log.info(f"  Total analisado:     {stats['total_frames']:,} frames ({duration_hours:.2f}h de conteúdo)")
    log.info(f"  Frames de vídeo:     {stats['kept_frames']:,} frames válidos")
    if args.mode == "freeze":
        log.info(
            f"  Pretos neutralizados:{stats['frozen_frames']+stats['dropped_frames']:,} frames ({stats['frozen_frames']:,} mantidos via TBC frame-hold)"
        )
        log.info(f"  Modo de sincronia:   TBC Frame-Hold aplicado (taxa constante mantida)")
    else:
        sec_recup = (stats["dropped_frames"] / fps) if fps > 0 else 0
        log.info(
            f"  Pretos descartados:  {stats['dropped_frames']:,} frames pretos eliminados ({sec_recup:.2f}s recuperados)"
        )
    fps_avg = (stats["total_frames"] / stats["elapsed"]) if stats["elapsed"] > 0 else 0
    log.info(f"  Tempo gasto:         {stats['elapsed']/60:.1f} minutos ({fps_avg:.0f} fps médio)")
    log.info(f"  Áudio:               100% contínuo e intacto (sem cortes)")
    log.info(f"  Arquivo de log:      {log_path}")

    if stats.get("chapters"):
        chap_path = f"{final_output_path}_meta.txt"
        with open(chap_path, "w", encoding="utf-8") as f:
            f.write(";FFMETADATA1\n")
            f.write("title=VHS Archive\n")
            f.write("artist=VHS Studio Pipeline\n")
            for i, sec in enumerate(stats["chapters"], 1):
                start_time = int(sec * 1000)
                end_time = int(
                    (stats["chapters"][i] * 1000)
                    if i < len(stats["chapters"])
                    else (stats["elapsed"] * 1000 + start_time + 100000)
                )
                f.write("[CHAPTER]\n")
                f.write("TIMEBASE=1/1000\n")
                f.write(f"START={start_time}\n")
                f.write(f"END={end_time}\n")
                f.write(f"title=Cena {i}\n")
        log.info(f"  Cenas detectadas:    {len(stats['chapters'])}. Embutindo metadados no arquivo final...")

        # Muxing the metadata into the container
        ext = "mkv" if args.output_codec == "ffv1" else "mov" if args.output_codec == "prores" else "mp4"
        muxed_path = f"{args.output_path}.muxed.{ext}"
        mux_cmd = [
            Toolchain.get_ffmpeg_path(),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            args.output_path,
            "-i",
            chap_path,
            "-map_metadata",
            "1",
            "-codec",
            "copy",
            muxed_path,
        ]
        try:
            subprocess.run(mux_cmd, check=True)
            os.replace(muxed_path, args.output_path)
            os.remove(chap_path)
            log.info(f"  Metadados/Capítulos injetados com sucesso!")
        except Exception as e:
            log.warning(f"  Aviso: Falha ao embutir capítulos ({e})")
            if os.path.exists(muxed_path):
                os.remove(muxed_path)

    log.info(f"============================================================")


def main():
    from vhs_studio.core.jobs import JobManager

    JobManager.acquire_lock()
    parser = argparse.ArgumentParser(description="Restauração direta ultra-rápida sem perda de sincronia A/V para VHS")
    parser.add_argument("input", help="Arquivo raw de entrada")
    parser.add_argument("--output", default=None, help="Arquivo final de saída")
    parser.add_argument("--crf", type=int, default=20, help="Qualidade args.crf / ICQ (padrão: 20)")
    parser.add_argument(
        "--mode",
        choices=["freeze", "drop", "passthrough"],
        default="freeze",
        help="Modo: 'freeze' (TBC frame-hold, zero pretos, sync perfeito), 'drop' (descarta pretos) ou 'passthrough' (preservação pura bit-perfect com TBC EH55)",
    )
    parser.add_argument(
        "--no-1080p",
        action="store_true",
        help="Mantém resolução original 480p/576p em vez de upscale 1080p",
    )
    parser.add_argument(
        "--deinterlacer",
        choices=["auto", "bwdif", "bwdif_single", "znedi3", "nnedi", "qtgmc", "none"],
        default="auto",
        help="Desentrelaçamento: auto (pula se já progressivo ~60p), bwdif (60p dobro), bwdif_single, znedi3/nnedi (redes neurais), qtgmc (VapourSynth), none",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=None,
        help="Forçar taxa de quadros (ex: 29.97, 59.94, 60.0)",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["auto", "stereo", "mono_l", "mono_r"],
        default="auto",
        help="Tratamento de áudio: auto (detecta canal mudo/duplicação), stereo, mono_l (L->R), mono_r",
    )
    parser.add_argument(
        "--device",
        choices=["jvc_gr_ax410", "jvc_hr_d227m", "dmr_eh55", "blackmagic", "auto"],
        default="auto",
        help="Perfil do hardware",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Solicita confirmação interativa se houver ambiguidade técnica",
    )
    parser.add_argument(
        "--denoise",
        action="store_true",
        help="Aplica redução de ruído temporal/espacial (hqdn3d)",
    )
    parser.add_argument(
        "--chroma-fix",
        action="store_true",
        help="Aplica correção de alinhamento de croma (chromashift)",
    )
    parser.add_argument(
        "--comb-filter",
        action="store_true",
        help="Aplica TComb 3D Comb Filter (apenas via VapourSynth)",
    )
    parser.add_argument(
        "--overscan-blanking",
        action="store_true",
        help="Aplica uma máscara preta (blanking) nos 12px inferiores para ocultar Head Switching Noise",
    )
    parser.add_argument(
        "--audio-treatment",
        action="store_true",
        help="Remove DC Offset, Hum Elétrico (60Hz notch) e reduz chiado de fundo do áudio analógico",
    )
    parser.add_argument(
        "--output-codec",
        type=str,
        choices=["h264", "prores", "ffv1"],
        default="h264",
        help="Formato de exportação (Delivery vs Archival)",
    )
    parser.add_argument(
        "--start-sec",
        type=float,
        default=None,
        help="Segundo inicial forçado (ignora detecção automática)",
    )
    parser.add_argument(
        "--audio-offset",
        type=float,
        default=0.0,
        help="Ajuste fino de áudio em segundos (ex: +1.0 para adiantar o áudio, -1.0 para atrasar)",
    )
    parser.add_argument(
        "--duration",
        "-t",
        type=float,
        default=None,
        help="Duração máxima a processar em segundos (para testes)",
    )
    parser.add_argument(
        "--install-qtgmc",
        action="store_true",
        help="Executa o instalador multiplataforma de VapourSynth + QTGMC para o sistema operacional",
    )
    args = parser.parse_args()

    if getattr(args, "install_qtgmc", False):
        log.info("[INSTALADOR] Iniciando instalador automático do VapourSynth + QTGMC...")
        ok = VapourSynthQTGMC.install_dependencies(interactive=True)
        sys.exit(0 if ok else 1)

    args.input_path = os.path.abspath(args.input)
    if not os.path.exists(args.input_path):
        log.error(f"[ERRO] Arquivo não encontrado: {args.input_path}")
        if os.path.exists(part_path):
            os.remove(part_path)
        try:
            JobManager.release_lock()
        except:
            pass
        sys.exit(1)

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    output_dir = os.path.join(project_root, "media", "output")
    os.makedirs(output_dir, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(args.input_path))[0]
    if args.output:
        args.output_path = os.path.abspath(args.output)
    else:
        suffix = "480p" if args.no_1080p else "1080p"
        ext = "mkv" if args.output_codec == "ffv1" else "mov" if args.output_codec == "prores" else "mp4"
        args.output_path = os.path.join(output_dir, f"{base_name}_restored_{suffix}.{ext}")

    log.info("\n[RESTAURAÇÃO] Arquivo de Entrada: {args.input_path}")

    # Análise técnica prévia e resolução de estratégia
    meta = vhs_common.probe_media(args.input_path)
    interlace_info = vhs_common.detect_interlace_status(args.input_path)
    audio_info = vhs_common.detect_audio_layout(args.input_path)

    forced_audio = None
    if args.device == "jvc_gr_ax410":
        forced_audio = "mono_l"
    elif args.audio_mode != "auto":
        forced_audio = args.audio_mode

    strat = vhs_common.resolve_pipeline_strategy(
        meta,
        interlace_info,
        audio_info,
        user_fps=args.fps,
        user_deint=None if args.deinterlacer == "auto" else args.deinterlacer,
        user_audio=forced_audio,
        interactive=args.interactive,
    )

    resolved_deint = "none"
    if strat["need_deinterlace"]:
        resolved_deint = "bwdif" if args.deinterlacer in ("auto", "bwdif") else args.deinterlacer
    elif args.deinterlacer in ("bwdif", "bwdif_single", "znedi3", "nnedi", "qtgmc"):
        resolved_deint = args.deinterlacer

    if resolved_deint == "qtgmc":
        log.error(
            "[QTGMC] QTGMC/VapourSynth não está implementado na pipeline atual. Por favor, aguarde a fase P4 (ou instale/configure as dependências manualmente se souber o que está fazendo). Utilize 'znedi3', 'nnedi' ou 'bwdif' por enquanto."
        )
        if os.path.exists(part_path):
            os.remove(part_path)
        try:
            JobManager.release_lock()
        except:
            pass
        sys.exit(1)

    strat["audio_policy"]
    args.target_fps = strat["args.target_fps"]

    if args.start_sec is not None:
        args.start_sec = args.start_sec
    else:
        args.start_sec = find_first_video_frame(args.input_path)

    restore_stream(opts)


if __name__ == "__main__":
    main()
