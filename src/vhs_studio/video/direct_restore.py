"""Module documentation pending."""

# flake8: noqa
from vhs_studio.core.jobs import JobManager

#!/usr/bin/env python3
"""
direct_restore.py - Direct Frame-Accurate Restoration Engine for VHS

High-Performance Architecture & A/V Sync Preservation:
  1. Identifies exact tape program start (end of introductory black leader).
  2. Synchronizes audio and video at the first recorded program frame.
  3. AUDIO INTEGRITY: Never clips or truncates audio mid-stream. Audio timeline runs continuous.
  4. ZERO BLACK FRAMES: Neutralizes dropouts and signal loss black screens (Y <= 18).
     'freeze' mode (TBC frame-hold): freezes the last valid frame during signal loss,
     preserving perfect temporal alignment and 100% lip sync.
  5. Broadcast deinterlacing (QTGMC / BWDIF) + 1080p Lanczos pillarbox upscale with hardware acceleration.
  6. Ultra-fast direct streaming to media/restored/ without intermediate temporary disk bloat.
"""

import sys
import os
import subprocess
from vhs_studio.core.system_process import run_silent, popen_silent
import argparse
import json
import time

from vhs_studio.core.logger import log
from vhs_studio.core import vhs_common
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.config.settings import VideoConfig
from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.stream_runner import StreamRunner
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC


from vhs_studio.core.vhs_common import probe_media


def get_stream_info(input_file):
    """Documentation for get_stream_info."""
    try:
        info = probe_media(input_file)
        return (
            int(info.get("width", VideoConfig.DEFAULT_WIDTH)),
            int(info.get("height", VideoConfig.DEFAULT_HEIGHT)),
            float(info.get("fps", VideoConfig.DEFAULT_FPS)),
            float(info.get("duration", 0.0)),
            str(info.get("audio_codec", "aac")),
        )
    except Exception as exc:
        log.warning(
            f"[RESTORE] Failed to probe stream info for '{input_file}': {exc}. Using default parameters."
        )
        return (
            VideoConfig.DEFAULT_WIDTH,
            VideoConfig.DEFAULT_HEIGHT,
            VideoConfig.DEFAULT_FPS,
            0.0,
            "aac",
        )


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

    p = popen_silent(
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

    if not p.stdout:
        return 0.0

    while True:
        buf = p.stdout.read(frame_bytes)
        if not buf or len(buf) < frame_bytes:
            break
        y_sample = buf[:y_bytes:64]
        mean_luma = sum(y_sample) / len(y_sample) if y_sample else 0
        if (
            mean_luma > VideoConfig.LUMA_THRESHOLD + 4.0
        ):  # slightly higher for detection
            consecutive_good += 1
            if consecutive_good >= VideoConfig.CONSECUTIVE_GOOD_FRAMES_REQUIRED:
                first_good_frame = frame_idx - (
                    VideoConfig.CONSECUTIVE_GOOD_FRAMES_REQUIRED - 1
                )
                break
        else:
            consecutive_good = 0
        frame_idx += 1

    if p.stdout:
        p.stdout.close()
    p.wait()

    start_sec = max(0.0, first_good_frame / fps)
    log.info(
        f"[RESTORATION] Active video content identified starting at {start_sec:.3f}s (frame {first_good_frame} @ {fps:.2f} fps)."
    )
    return start_sec


def print_log_tail(log_path, lines=20):
    """Documentation for print_log_tail."""
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
    """Execute frame-accurate streaming restoration with synchronized archival defect reporting."""
    from vhs_studio.capture.qc import make_archival_report_session, sec_to_timecode

    w, h, detected_fps, duration, _ = get_stream_info(args.input_path)
    fps = args.target_fps if args.target_fps else detected_fps
    if fps <= 0:
        fps = VideoConfig.DEFAULT_FPS
    if detected_fps <= 0:
        detected_fps = fps
    frame_bytes = int(w * h * 1.5)
    y_bytes = w * h

    target_1080p = not getattr(args, "no_1080p", False)
    builder = FilterBuilder(
        target_1080p=target_1080p,
        crf=args.crf,
        mode=args.mode,
        output_codec=args.output_codec,
    )

    checkpoint_path = f"{args.output_path}.checkpoint.json"
    report_json_path = f"{args.output_path}_qc_report.json"
    resume_state = None
    existing_report = None

    if getattr(args, "resume", False):
        if os.path.exists(checkpoint_path):
            try:
                with open(checkpoint_path, "r", encoding="utf-8") as f:
                    chk = json.load(f)
                if (
                    chk.get("status") == "completed"
                    and os.path.exists(args.output_path)
                    and os.path.getsize(args.output_path) > 1024
                ):
                    log.info(
                        f"[RESTORATION] Completed checkpoint found for {args.output_path}. "
                        "Job already completed successfully. Skipping."
                    )
                    return
                if int(chk.get("total_frames", 0)) > 0:
                    resume_state = {
                        "total_frames": int(chk.get("total_frames", 0)),
                        "kept_frames": int(chk.get("kept_frames", 0)),
                        "frozen_frames": int(chk.get("frozen_frames", 0)),
                        "dropped_frames": int(chk.get("dropped_frames", 0)),
                        "elapsed_seconds": float(chk.get("elapsed_seconds", 0.0)),
                        "chapters": list(chk.get("chapters", [])),
                    }
            except Exception:
                pass
        if os.path.exists(report_json_path):
            try:
                with open(report_json_path, "r", encoding="utf-8") as f:
                    existing_report = json.load(f)
            except Exception:
                existing_report = None

    apply_chroma = getattr(args, "apply_chroma", getattr(args, "chroma_fix", False))
    apply_denoise = getattr(args, "apply_denoise", getattr(args, "denoise", False))
    apply_comb = getattr(args, "apply_comb_filter", getattr(args, "comb_filter", False))
    apply_blanking = getattr(args, "apply_overscan_blanking", getattr(args, "overscan_blanking", False))
    apply_dropout = getattr(args, "apply_dropout_clean", getattr(args, "dropout_clean", False))
    apply_treatment = getattr(args, "apply_audio_treatment", getattr(args, "audio_treatment", False))
    apply_ai_audio = getattr(args, "apply_ai_audio_denoise", getattr(args, "ai_audio_denoise", False))

    base_start_sec = float(getattr(args, "start_sec", 0.0) or 0.0)
    pipeline_params = {
        "mode": args.mode,
        "crf": args.crf,
        "output_codec": args.output_codec,
        "deinterlacer": args.deinterlacer,
        "audio_mode": args.audio_mode,
        "chroma_fix": apply_chroma,
        "denoise": apply_denoise,
        "comb_filter": apply_comb,
        "overscan_blanking": apply_blanking,
        "dropout_clean": apply_dropout,
        "audio_treatment": apply_treatment,
        "ai_audio_denoise": apply_ai_audio,
    }

    report_session = make_archival_report_session(
        source_path=args.input_path,
        output_path=args.output_path,
        fps=detected_fps,
        width=w,
        height=h,
        base_start_sec=base_start_sec,
        luma_threshold=VideoConfig.LUMA_THRESHOLD,
        initial_report=existing_report,
        pipeline_params=pipeline_params,
        resolved_deint=args.deinterlacer,
        audio_mode=args.audio_mode,
        target_1080p=target_1080p,
        encoder=builder.encoder or "libx264",
    )

    effective_start_sec = base_start_sec
    if resume_state and int(float(str(resume_state["total_frames"]))) > 0:
        synced_f = int(float(str(resume_state["total_frames"])))
        report_session["truncate_to_frame"](synced_f, reason="checkpoint_resume")
        effective_start_sec = base_start_sec + (synced_f / detected_fps)
        log.info(
            f"[RESTORATION] Resuming processing and synchronized forensic report starting from "
            f"frame {synced_f} ({sec_to_timecode(effective_start_sec)})."
        )

    log.info(f"[RESTORATION] Input resolution: {w}x{h} @ {fps:.2f} fps")
    log.info(f"[RESTORATION] Deinterlacing mode: {args.deinterlacer}")
    log.info(f"[RESTORATION] Audio channel policy: {args.audio_mode}")
    log.info(f"[RESTORATION] Hardware acceleration / Encoder: {builder.encoder}")
    mode_desc = {
        "freeze": "TBC Frame-Hold (Freezes last known good frame to preserve constant sync)",
        "drop": "Direct discard (Speeds up video)",
        "passthrough": "Pure Passthrough (No frame alteration, bit-perfect for hardware TBC use)",
    }.get(args.mode, args.mode)
    log.info(f"[RESTORATION] Black removal mode: {mode_desc}")
    if apply_comb:
        log.info("[RESTORATION] 3D Comb filter enabled")
    if abs(args.audio_offset) > 0.001:
        log.info(
            f"[RESTORATION] Audio sync offset: {args.audio_offset:+.3f}s "
            f"({'advancing' if args.audio_offset > 0 else 'delaying'} audio)"
        )

    log_path = f"{args.output_path}.log"
    log_file = open(
        log_path, "w", encoding="utf-8", errors="replace"
    )  # pylint: disable=consider-using-with

    # Inicia decodificador rawvideo do vídeo
    cmd_in = [
        Toolchain.get_ffmpeg_path(),
        "-hide_banner",
        "-threads",
        "0",
    ]
    if effective_start_sec > 0.05:
        cmd_in += ["-ss", f"{effective_start_sec:.3f}"]
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

    p_in = popen_silent(
        cmd_in, stdout=subprocess.PIPE, stderr=log_file, bufsize=16 * 1024 * 1024
    )

    vf = builder.build_video_filters(
        apply_chroma,
        apply_denoise,
        args.deinterlacer,
        apply_comb_filter=apply_comb,
        overscan_blanking=apply_blanking,
        apply_dropout_clean=apply_dropout,
    )

    from vhs_studio.core.atomic_io import AtomicIO

    # Hash of params
    params_dict = {
        "w": w,
        "h": h,
        "fps": detected_fps,
        "start": base_start_sec,
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

    # Limpa arquivo parcial residual se existente para garantir inicialização limpa
    if os.path.exists(part_path):
        try:
            os.remove(part_path)
            log.info(f"[RESTAURAÇÃO] Arquivo parcial prévio removido para reinício limpo: {part_path}")
        except Exception as e:
            log.warning(
                f"[RESTAURAÇÃO] Não foi possível remover arquivo residual '{part_path}': {e}"
            )

    # IMPORTANTE (T-1.11): Passamos detected_fps (input_rate) em vez de args.target_fps
    cmd_out = builder.build_ffmpeg_output_args(
        args.input_path,
        part_path,
        w,
        h,
        detected_fps,
        effective_start_sec,
        args.audio_offset,
        args.duration,
        vf,
        args.audio_mode,
        audio_treatment=apply_treatment,
        ai_audio_denoise=apply_ai_audio,
    )

    p_out = popen_silent(
        cmd_out, stdin=subprocess.PIPE, stderr=log_file, bufsize=16 * 1024 * 1024
    )

    total_duration = args.duration if args.duration else max(0.0, duration - base_start_sec)
    total_expected_frames = int(total_duration * fps) if total_duration > 0 else 0

    runner = StreamRunner(
        mode=args.mode,
        frame_bytes=frame_bytes,
        y_bytes=y_bytes,
        luma_threshold=VideoConfig.LUMA_THRESHOLD,
        total_expected_frames=total_expected_frames,
        width=w,
        height=h,
    )

    def _persist_checkpoint_and_report(total, kept, frozen, dropped, elap, chk_status="in_progress"):
        try:
            tmp_chk = f"{checkpoint_path}.tmp"
            with open(tmp_chk, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "source": args.input_path,
                        "destination": args.output_path,
                        "status": chk_status,
                        "total_frames": total,
                        "total_expected_frames": total_expected_frames,
                        "kept_frames": kept,
                        "frozen_frames": frozen,
                        "dropped_frames": dropped,
                        "elapsed_seconds": elap,
                        "fps": fps,
                        "start_sec": base_start_sec,
                    },
                    f,
                    indent=2,
                )
            for _ in range(5):
                try:
                    os.replace(tmp_chk, checkpoint_path)
                    break
                except (PermissionError, OSError):
                    time.sleep(0.02)
        except Exception:
            pass
        try:
            report_session["sync_to_disk"](
                synced_frame=total,
                elapsed_sec=elap,
                status=chk_status,
            )
        except Exception:
            pass

    def on_stream_progress(total, kept, frozen, dropped, elap):
        _persist_checkpoint_and_report(total, kept, frozen, dropped, elap, chk_status="in_progress")

    stats = runner.run(
        p_in,
        p_out,
        detected_fps,
        on_progress=on_stream_progress,
        report_session=report_session,
        initial_state=resume_state,
    )

    if p_in.stdout:
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
        _persist_checkpoint_and_report(
            stats["total_frames"],
            stats["kept_frames"],
            stats["frozen_frames"],
            stats["dropped_frames"],
            stats["elapsed"],
            chk_status="interrupted",
        )
        log.error(
            f"\n[ERRO] O processo de restauração falhou! (in rc={rc_in}, out rc={rc_out})"
        )
        print_log_tail(log_path, lines=25)
        try:
            JobManager.release_lock()
        except Exception:
            pass
        sys.exit(1)

    # Atomic commit to target output path
    AtomicIO.commit_file(part_path, args.output_path)
    if final_output_path != args.output_path and os.path.exists(args.output_path):
        import shutil
        try:
            shutil.copy2(args.output_path, final_output_path)
        except Exception as copy_err:
            log.error(
                f"[RESTORE] Failed to copy master output to '{final_output_path}': {copy_err}"
            )
            _persist_checkpoint_and_report(
                stats["total_frames"],
                stats["kept_frames"],
                stats["frozen_frames"],
                stats["dropped_frames"],
                stats["elapsed"],
                chk_status="failed",
            )
            raise RuntimeError(
                f"Failed to copy restored output to target destination '{final_output_path}': {copy_err}"
            ) from copy_err

    # Save completed checkpoint and synchronized archival report
    _persist_checkpoint_and_report(
        stats["total_frames"],
        stats["kept_frames"],
        stats["frozen_frames"],
        stats["dropped_frames"],
        stats["elapsed"],
        chk_status="completed",
    )

    final_size_bytes = (
        os.path.getsize(args.output_path) if os.path.exists(args.output_path) else 0
    )
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
    log.info(
        f"  Total analisado:     {stats['total_frames']:,} frames ({duration_hours:.2f}h de conteúdo)"
    )
    log.info(f"  Frames de vídeo:     {stats['kept_frames']:,} frames válidos")
    if args.mode == "freeze":
        log.info(
            f"  Pretos neutralizados:{stats['frozen_frames']+stats['dropped_frames']:,} frames ({stats['frozen_frames']:,} mantidos via TBC frame-hold)"
        )
        log.info(
            f"  Modo de sincronia:   TBC Frame-Hold aplicado (taxa constante mantida)"
        )
    else:
        sec_recup = (stats["dropped_frames"] / fps) if fps > 0 else 0
        log.info(
            f"  Pretos descartados:  {stats['dropped_frames']:,} frames pretos eliminados ({sec_recup:.2f}s recuperados)"
        )
    fps_avg = (stats["total_frames"] / stats["elapsed"]) if stats["elapsed"] > 0 else 0
    log.info(
        f"  Tempo gasto:         {stats['elapsed']/60:.1f} minutos ({fps_avg:.0f} fps médio)"
    )
    log.info(f"  Áudio:               100% contínuo e intacto (sem cortes)")
    log.info(f"  Arquivo de log:      {log_path}")
    log.info(f"  Relatório Técnico:   {report_json_path}")

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
        log.info(
            f"  Cenas detectadas:    {len(stats['chapters'])}. Embutindo metadados no arquivo final..."
        )

        # Muxing the metadata into the container
        ext = (
            "mkv"
            if args.output_codec == "ffv1"
            else "mov" if args.output_codec == "prores" else "mp4"
        )
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
            run_silent(mux_cmd, check=True)
            os.replace(muxed_path, args.output_path)
            os.remove(chap_path)
            log.info("  Metadata/chapters injected successfully!")
        except Exception as e:
            log.warning(f"  Warning: Failed to mux chapters ({e})")
            if os.path.exists(muxed_path):
                os.remove(muxed_path)

    log.info("============================================================")


def main(argv=None):
    """Main CLI entrypoint for direct VHS restoration."""
    JobManager.acquire_lock()
    parser = argparse.ArgumentParser(
        description="Ultra-fast direct VHS restoration engine with lossless A/V synchronization"
    )
    parser.add_argument("input", help="Raw input video path")
    parser.add_argument("--output", default=None, help="Final output file destination")
    parser.add_argument(
        "--crf", type=int, default=20, help="Output CRF / ICQ quality level (default: 20)"
    )
    parser.add_argument(
        "--mode",
        choices=["freeze", "drop", "passthrough"],
        default="freeze",
        help="Mode: 'freeze' (TBC frame-hold, zero blackouts, lip-sync), 'drop' (discards dropouts), or 'passthrough' (bit-perfect with hardware TBC)",
    )
    parser.add_argument(
        "--no-1080p",
        action="store_true",
        help="Preserve native 480p/576p resolution instead of 1080p Lanczos upscale",
    )
    parser.add_argument(
        "--deinterlacer",
        choices=["auto", "bwdif", "bwdif_single", "znedi3", "nnedi", "qtgmc", "none"],
        default="auto",
        help="Deinterlacer: auto (skips if ~60p progressive), qtgmc (VapourSynth SSOT), znedi3/nnedi (neural), bwdif (motion-adaptive draft), none",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=None,
        help="Override output frame rate (e.g. 29.97, 59.94, 60.0)",
    )
    parser.add_argument(
        "--audio-mode",
        choices=["auto", "stereo", "mono_l", "mono_r"],
        default="auto",
        help="Audio mode: auto (mute/duplication check), stereo, mono_l (L->R duplicate), mono_r",
    )
    parser.add_argument(
        "--device",
        choices=["jvc_gr_ax410", "jvc_hr_d227m", "dmr_eh55", "blackmagic", "auto"],
        default="auto",
        help="Hardware deck profile",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Request interactive confirmation if ambiguity is detected",
    )
    parser.add_argument(
        "--denoise",
        action="store_true",
        help="Apply spatial/temporal denoising (hqdn3d)",
    )
    parser.add_argument(
        "--chroma-fix",
        action="store_true",
        help="Apply chroma alignment correction (chromashift)",
    )
    parser.add_argument(
        "--comb-filter",
        action="store_true",
        help="Apply TComb 3D Comb Filter (VapourSynth pipeline)",
    )
    parser.add_argument(
        "--overscan-blanking",
        action="store_true",
        help="Apply black blanking on bottom 12 lines to conceal head switching noise",
    )
    parser.add_argument(
        "--audio-treatment",
        action="store_true",
        help="Remove DC Offset, 60Hz hum notch, and tape hiss filtering",
    )
    parser.add_argument(
        "--dropout-clean",
        action="store_true",
        help="Detect and attenuate oxide dropouts and white streaks",
    )
    parser.add_argument(
        "--ai-audio-denoise",
        action="store_true",
        help="Apply deep neural audio noise and hiss reduction",
    )
    parser.add_argument(
        "--output-codec",
        type=str,
        choices=["h264", "hevc", "prores", "ffv1"],
        default="h264",
        help="Export codec format (Delivery vs Archival)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume restoration from last saved checkpoint",
    )
    parser.add_argument(
        "--start-sec",
        type=float,
        default=None,
        help="Forced start second (overrides automatic black leader detection)",
    )
    parser.add_argument(
        "--audio-offset",
        type=float,
        default=0.0,
        help="Fine audio offset in seconds (e.g. +1.0 advance, -1.0 delay)",
    )
    parser.add_argument(
        "--duration",
        "-t",
        type=float,
        default=None,
        help="Maximum duration to process in seconds (for testing)",
    )
    parser.add_argument(
        "--install-qtgmc",
        action="store_true",
        help="Run cross-platform VapourSynth + QTGMC automated installer",
    )
    args = parser.parse_args(argv)

    if getattr(args, "install_qtgmc", False):
        log.info(
            "[INSTALLER] Starting automated VapourSynth + QTGMC installer..."
        )
        ok = VapourSynthQTGMC.install_dependencies(interactive=True)
        sys.exit(0 if ok else 1)

    args.input_path = os.path.abspath(args.input)
    if not os.path.exists(args.input_path):
        log.error(f"[ERROR] File not found: {args.input_path}")
        try:
            JobManager.release_lock()
        except Exception:
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
        ext = (
            "mkv"
            if args.output_codec == "ffv1"
            else "mov" if args.output_codec == "prores" else "mp4"
        )
        args.output_path = os.path.join(
            output_dir, f"{base_name}_restored_{suffix}.{ext}"
        )

    target_dir = os.path.dirname(args.output_path)
    try:
        os.makedirs(target_dir, exist_ok=True)
        test_file = os.path.join(target_dir, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
    except PermissionError:
        log.error(
            f"[WINDOWS DEFENDER / PERMISSÃO] Acesso de escrita negado na pasta: {target_dir}\n"
            "O recurso 'Acesso a Pastas Controladas' (Controlled Folder Access) do Windows Defender ou uma restrição de permissão está bloqueando gravações.\n"
            "Solução: Permita o executável do Python no Windows Defender ou altere o diretório de destino."
        )
        JobManager.release_lock()
        sys.exit(1)

    log.info(f"\n[RESTAURAÇÃO] Arquivo de Entrada: {args.input_path}")

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
        if args.deinterlacer == "auto":
            resolved_deint = "qtgmc" if VapourSynthQTGMC.is_available() else "bwdif"
        else:
            resolved_deint = args.deinterlacer
    elif args.deinterlacer in ("bwdif", "bwdif_single", "znedi3", "nnedi", "qtgmc"):
        resolved_deint = args.deinterlacer

    if resolved_deint == "qtgmc":
        if VapourSynthQTGMC.is_available():
            log.info("[QTGMC] VapourSynth/vspipe detected for high-fidelity deinterlacing.")
        else:
            log.warning(
                "[QTGMC] VapourSynth/vspipe not detected for direct streaming. "
                "Applying automatic fallback to broadcast 'bwdif'."
            )
            resolved_deint = "bwdif"
            args.deinterlacer = "bwdif"

    args.audio_mode = strat.get("audio_policy", "stereo")
    args.target_fps = strat.get("target_fps", getattr(args, "fps", 59.94) or 59.94)

    if args.start_sec is not None:
        args.start_sec = args.start_sec
    else:
        args.start_sec = find_first_video_frame(args.input_path)

    try:
        restore_stream(args)
    finally:
        JobManager.release_lock()


if __name__ == "__main__":
    main()
