import sys
import time
try:
    from lib.logger import log
except ImportError:
    from logger import log

class StreamRunner:
    def __init__(self, mode, frame_bytes, y_bytes, luma_threshold=18.0):
        self.mode = mode
        self.frame_bytes = frame_bytes
        self.y_bytes = y_bytes
        self.luma_threshold = luma_threshold

    def run(self, p_in, p_out, fps):
        total_frames = 0
        dropped_frames = 0
        frozen_frames = 0
        kept_frames = 0
        last_good_frame = None

        t0 = time.time()
        last_log_time = t0

        log.info("[RESTAURAÇÃO] Iniciando processamento streaming frame-by-frame...")

        stream_broken = False
        while True:
            buf = p_in.stdout.read(self.frame_bytes)
            if not buf or len(buf) < self.frame_bytes:
                break

            total_frames += 1
            y_sample = buf[:self.y_bytes:64]
            mean_luma = sum(y_sample) / len(y_sample) if y_sample else 0

            try:
                if self.mode == "passthrough":
                    kept_frames += 1
                    p_out.stdin.write(buf)
                elif mean_luma <= self.luma_threshold:
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
            if now - last_log_time >= 5.0:
                last_log_time = now
                elapsed = now - t0
                fps_proc = total_frames / elapsed if elapsed > 0 else 0
                if self.mode == "passthrough":
                    log.info(f"  -> Frames: {total_frames:,} | Mantidos: {kept_frames:,} (Passthrough Puro 100%) | Velocidade: {fps_proc:.0f} fps")
                elif self.mode == "freeze":
                    pct_elim = ((frozen_frames + dropped_frames) / total_frames) * 100 if total_frames > 0 else 0
                    log.info(f"  -> Frames: {total_frames:,} | Válidos: {kept_frames:,} | Congelados TBC: {frozen_frames:,} | Pretos neutralizados: {frozen_frames+dropped_frames:,} ({pct_elim:.1f}%) | Velocidade: {fps_proc:.0f} fps")
                else:
                    pct_dropped = (dropped_frames / total_frames) * 100 if total_frames > 0 else 0
                    log.info(f"  -> Frames: {total_frames:,} | Mantidos: {kept_frames:,} | Pretos descartados: {dropped_frames:,} ({pct_dropped:.1f}%) | Velocidade: {fps_proc:.0f} fps")

        t1 = time.time()
        elapsed = t1 - t0
        return {
            "total_frames": total_frames,
            "kept_frames": kept_frames,
            "frozen_frames": frozen_frames,
            "dropped_frames": dropped_frames,
            "elapsed": elapsed,
            "stream_broken": stream_broken
        }
