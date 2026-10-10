"""Module documentation pending."""

import time
from vhs_studio.core.logger import log


class StreamRunner:
    """Documentation for StreamRunner."""

    def __init__(self, mode, frame_bytes, y_bytes, luma_threshold=18.0, total_expected_frames=0):
        """Documentation for __init__."""
        self.mode = mode
        self.frame_bytes = frame_bytes
        self.y_bytes = y_bytes
        self.luma_threshold = luma_threshold
        self.total_expected_frames = total_expected_frames

    def run(self, p_in, p_out, fps, on_progress=None):
        """Documentation for run."""
        total_frames = 0
        dropped_frames = 0
        frozen_frames = 0
        kept_frames = 0
        last_good_frame = None
        chapters = []
        bad_streak = 0

        t0 = time.time()
        last_log_time = t0
        last_window_frames = 0

        log.info("[RESTAURAÇÃO] Iniciando processamento streaming frame-by-frame...")

        stream_broken = False
        while True:
            buf = p_in.stdout.read(self.frame_bytes)
            if not buf or len(buf) < self.frame_bytes:
                break

            total_frames += 1
            y_sample = memoryview(buf)[: self.y_bytes : 64]
            mean_luma = sum(y_sample) / len(y_sample) if y_sample else 0
            is_bad = mean_luma <= self.luma_threshold

            try:
                if self.mode == "passthrough":
                    kept_frames += 1
                    p_out.stdin.write(buf)
                elif is_bad:
                    if self.mode == "freeze":
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
                log.error(f"[ERRO] Falha de escrita no processo de saída: {e}")
                stream_broken = True
                break

            now = time.time()
            if now - last_log_time >= 1.0:
                elapsed_window = now - last_log_time
                frames_window = total_frames - last_window_frames if 'last_window_frames' in locals() else total_frames
                last_window_frames = total_frames
                last_log_time = now
                elapsed = now - t0
                if on_progress:
                    try:
                        on_progress(total_frames, kept_frames, frozen_frames, dropped_frames, elapsed)
                    except Exception:
                        pass
                fps_proc = frames_window / elapsed_window if elapsed_window > 0 else (total_frames / elapsed if elapsed > 0 else 0)
                speed_x = fps_proc / fps if fps > 0 else 1.0

                prog_prefix = ""
                eta_str = "--:--:--"
                if self.total_expected_frames > 0:
                    prog_pct = min(100.0, (total_frames / self.total_expected_frames) * 100.0)
                    prog_prefix = f"PROGRESS: {int(prog_pct)}% | "
                    rem_frames = max(0, self.total_expected_frames - total_frames)
                    rem_sec = rem_frames / fps_proc if fps_proc > 0 else 0
                    eta_str = f"{int(rem_sec // 3600):02d}:{int((rem_sec % 3600) // 60):02d}:{int(rem_sec % 60):02d}"

                telemetry_suffix = (
                    f" | FPS: {fps_proc:.1f} | ETA: {eta_str} | Speed: {speed_x:.2f}x | Velocidade: {fps_proc:.0f} fps"
                )
                if self.total_expected_frames > 0:
                    frame_str = f"Frames: {total_frames:,}/{self.total_expected_frames:,}"
                else:
                    frame_str = f"Frames: {total_frames:,}"

                if self.mode == "passthrough":
                    log.info(
                        f"  -> {prog_prefix}{frame_str} | Mantidos: {kept_frames:,} (Passthrough Puro 100%){telemetry_suffix}"  # noqa: E501
                    )
                elif self.mode == "freeze":
                    pct_elim = (
                        ((frozen_frames + dropped_frames) / total_frames) * 100
                        if total_frames > 0
                        else 0
                    )
                    log.info(
                        f"  -> {prog_prefix}{frame_str} | Válidos: {kept_frames:,} | Congelados TBC: {frozen_frames:,} | Pretos neutralizados: {frozen_frames+dropped_frames:,} ({pct_elim:.1f}%){telemetry_suffix}"  # noqa: E501
                    )
                else:
                    pct_dropped = (
                        (dropped_frames / total_frames) * 100 if total_frames > 0 else 0
                    )
                    log.info(
                        f"  -> {prog_prefix}{frame_str} | Mantidos: {kept_frames:,} | Pretos descartados: {dropped_frames:,} ({pct_dropped:.1f}%){telemetry_suffix}"  # noqa: E501
                    )

            if is_bad:
                bad_streak += 1
            else:
                if bad_streak > fps * 1.5:  # 1.5 seconds of static/black = new scene
                    scene_sec = total_frames / fps
                    chapters.append(scene_sec)
                    log.info(
                        f"[SCENE DETECT] Nova cena detectada em {scene_sec:.2f}s (após corte de câmera)"
                    )
                bad_streak = 0

        t1 = time.time()
        elapsed = t1 - t0
        return {
            "total_frames": total_frames,
            "kept_frames": kept_frames,
            "frozen_frames": frozen_frames,
            "dropped_frames": dropped_frames,
            "elapsed": elapsed,
            "stream_broken": stream_broken,
            "chapters": chapters,
        }
