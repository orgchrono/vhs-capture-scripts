"""Real-time frame-by-frame streaming processor and live preview frame buffer.

Employs lexical closures (make_frame_buffer_closure, make_stream_accumulator_closure)
to isolate frame state, TBC frame-hold logic, and real-time archival defect reporting
from external mutation and side-effects.
"""

import threading
import time
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple
from vhs_studio.core.constants import DEFAULT_LUMA_THRESHOLD, DEFAULT_NTSC_FPS
from vhs_studio.core.logger import log


def make_frame_buffer_closure() -> Dict[str, Callable[..., Any]]:
    """Create a thread-safe lexical closure holding the latest rendered preview frame."""
    lock = threading.Lock()
    state: Dict[str, Any] = {
        "snapshot": (None, 0, 0.0),
    }

    def update(jpeg_bytes: bytes, frame_number: int, timestamp: float) -> None:
        with lock:
            state["snapshot"] = (bytes(jpeg_bytes), int(frame_number), float(timestamp))

    def get_latest() -> Tuple[Optional[bytes], int, float]:
        with lock:
            return state["snapshot"]

    def clear() -> None:
        with lock:
            state["snapshot"] = (None, 0, 0.0)

    return {
        "update": update,
        "get_latest": get_latest,
        "clear": clear,
    }


_DEFAULT_FRAME_BUFFER = make_frame_buffer_closure()


class RestorationFrameBuffer:
    """Thread-safe facade over the lexical frame buffer closure."""

    _instance: Optional["RestorationFrameBuffer"] = None
    _lock = threading.Lock()

    def __init__(
        self,
        buffer_closure: Optional[Dict[str, Callable[..., Any]]] = None,
    ) -> None:
        self._closure = buffer_closure or _DEFAULT_FRAME_BUFFER

    @property
    def latest_jpeg(self) -> Optional[bytes]:
        return self._closure["get_latest"]()[0]

    @property
    def frame_number(self) -> int:
        return self._closure["get_latest"]()[1]

    @property
    def timestamp(self) -> float:
        return self._closure["get_latest"]()[2]

    @classmethod
    def get_instance(cls) -> "RestorationFrameBuffer":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls(_DEFAULT_FRAME_BUFFER)
            return cls._instance

    def update(self, jpeg_bytes: bytes, frame_number: int, timestamp: float) -> None:
        self._closure["update"](jpeg_bytes, frame_number, timestamp)

    def get_latest(self) -> Tuple[Optional[bytes], int, float]:
        return self._closure["get_latest"]()

    def clear(self) -> None:
        self._closure["clear"]()


def make_stream_accumulator_closure(
    mode: str,
    y_bytes: int,
    luma_threshold: float,
    fps: float,
    initial_state: Optional[Mapping[str, Any]] = None,
    report_session: Optional[Mapping[str, Callable[..., Any]]] = None,
) -> Dict[str, Callable[..., Any]]:
    """Create a lexical closure encapsulating frame-by-frame TBC state and defect tracking."""
    init = dict(initial_state or {})
    safe_fps = fps if fps > 0 else DEFAULT_NTSC_FPS

    state: Dict[str, Any] = {
        "total_frames": int(init.get("total_frames", 0)),
        "kept_frames": int(init.get("kept_frames", 0)),
        "frozen_frames": int(init.get("frozen_frames", 0)),
        "dropped_frames": int(init.get("dropped_frames", 0)),
        "prior_elapsed": float(init.get("elapsed_seconds", 0.0)),
        "chapters": list(init.get("chapters", [])),
        "last_good_frame": None,
        "bad_streak": 0,
        "stream_broken": False,
    }

    def step_frame(buf: bytes) -> Tuple[Optional[bytes], str, int]:
        """Process a single raw frame buffer, returning (frame_to_write, action_taken, total_frames)."""
        state["total_frames"] += 1
        current_idx = int(state["total_frames"])

        y_sample = memoryview(buf)[:y_bytes:64]
        mean_luma = (sum(y_sample) / len(y_sample)) if y_sample else 0.0
        is_bad = mean_luma <= luma_threshold

        frame_to_write: Optional[bytes] = None
        action_taken = "kept"

        if mode == "passthrough":
            state["kept_frames"] += 1
            frame_to_write = buf
            action_taken = "kept"
        elif is_bad:
            if mode == "freeze":
                if state["last_good_frame"] is not None:
                    frame_to_write = state["last_good_frame"]
                    state["frozen_frames"] += 1
                    action_taken = "frozen"
                else:
                    state["dropped_frames"] += 1
                    action_taken = "dropped"
            else:
                state["dropped_frames"] += 1
                action_taken = "dropped"
        else:
            state["last_good_frame"] = buf
            state["kept_frames"] += 1
            frame_to_write = buf
            action_taken = "kept"

        if is_bad:
            state["bad_streak"] += 1
        else:
            if state["bad_streak"] > safe_fps * 1.5:
                scene_sec = current_idx / safe_fps
                state["chapters"].append(scene_sec)
                log.info(
                    f"[SCENE DETECT] Nova cena detectada em {scene_sec:.2f}s (após corte de câmera)"
                )
            state["bad_streak"] = 0

        if report_session and "record_frame" in report_session:
            try:
                report_session["record_frame"](current_idx, buf, action_taken)
            except Exception:
                pass

        return frame_to_write, action_taken, current_idx

    def mark_broken() -> None:
        state["stream_broken"] = True

    def get_stats(session_elapsed: float) -> Dict[str, Any]:
        total_elapsed = float(state["prior_elapsed"]) + max(0.0, session_elapsed)
        return {
            "total_frames": int(state["total_frames"]),
            "kept_frames": int(state["kept_frames"]),
            "frozen_frames": int(state["frozen_frames"]),
            "dropped_frames": int(state["dropped_frames"]),
            "elapsed": total_elapsed,
            "stream_broken": bool(state["stream_broken"]),
            "chapters": list(state["chapters"]),
        }

    return {
        "step_frame": step_frame,
        "mark_broken": mark_broken,
        "get_stats": get_stats,
    }


class StreamRunner:
    """Executes frame-accurate video streaming with TBC frame-hold and synchronized defect reporting."""

    def __init__(
        self,
        mode: str,
        frame_bytes: int,
        y_bytes: int,
        luma_threshold: float = DEFAULT_LUMA_THRESHOLD,
        total_expected_frames: int = 0,
        width: int = 0,
        height: int = 0,
    ):
        self.mode = mode
        self.frame_bytes = frame_bytes
        self.y_bytes = y_bytes
        self.luma_threshold = luma_threshold
        self.total_expected_frames = total_expected_frames
        self.width = width
        self.height = height

    def run(
        self,
        p_in: Any,
        p_out: Any,
        fps: float,
        on_progress: Optional[Callable[[int, int, int, int, float], None]] = None,
        report_session: Optional[Mapping[str, Callable[..., Any]]] = None,
        initial_state: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run the frame-by-frame restoration stream using a side-effect-free state closure."""
        safe_fps = fps if fps > 0 else DEFAULT_NTSC_FPS
        acc = make_stream_accumulator_closure(
            mode=self.mode,
            y_bytes=self.y_bytes,
            luma_threshold=self.luma_threshold,
            fps=safe_fps,
            initial_state=initial_state,
            report_session=report_session,
        )

        t0 = time.time()
        last_log_time = t0
        last_preview_time = t0
        init_stats = acc["get_stats"](0.0)
        last_window_frames = int(init_stats["total_frames"])
        RestorationFrameBuffer.get_instance().clear()

        log.info("[RESTAURAÇÃO] Iniciando processamento streaming frame-by-frame...")

        try:
            while True:
                buf = p_in.stdout.read(self.frame_bytes)
                if not buf or len(buf) < self.frame_bytes:
                    break

                frame_to_write, _, total_frames = acc["step_frame"](buf)

                if frame_to_write is not None:
                    try:
                        p_out.stdin.write(frame_to_write)
                    except (BrokenPipeError, OSError) as e:
                        log.error(f"[ERRO] Falha de escrita no processo de saída: {e}")
                        acc["mark_broken"]()
                        break

                now = time.time()
                if self.width > 0 and self.height > 0 and (now - last_preview_time >= 0.1):
                    last_preview_time = now
                    try:
                        import cv2
                        import numpy as np

                        yuv = np.frombuffer(buf, dtype=np.uint8).reshape(
                            (self.height * 3 // 2, self.width)
                        )
                        bgr = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR_I420)
                        resized = cv2.resize(bgr, (640, 360), interpolation=cv2.INTER_NEAREST)
                        success, jpg = cv2.imencode(
                            ".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 70]
                        )
                        if success:
                            RestorationFrameBuffer.get_instance().update(
                                jpg.tobytes(),
                                total_frames,
                                total_frames / safe_fps,
                            )
                    except Exception:
                        pass

                if now - last_log_time >= 1.0:
                    elapsed_window = now - last_log_time
                    snap = acc["get_stats"](now - t0)
                    cur_total = int(snap["total_frames"])
                    cur_kept = int(snap["kept_frames"])
                    cur_frozen = int(snap["frozen_frames"])
                    cur_dropped = int(snap["dropped_frames"])
                    cur_elapsed = float(snap["elapsed"])

                    frames_window = max(0, cur_total - last_window_frames)
                    last_window_frames = cur_total
                    last_log_time = now

                    if on_progress:
                        try:
                            on_progress(
                                cur_total,
                                cur_kept,
                                cur_frozen,
                                cur_dropped,
                                cur_elapsed,
                            )
                        except Exception:
                            pass

                    fps_proc = (
                        frames_window / elapsed_window
                        if elapsed_window > 0
                        else (cur_total / cur_elapsed if cur_elapsed > 0 else 0.0)
                    )
                    speed_x = fps_proc / safe_fps if safe_fps > 0 else 1.0

                    prog_prefix = ""
                    eta_str = "--:--:--"
                    if self.total_expected_frames > 0:
                        prog_pct = min(100.0, (cur_total / self.total_expected_frames) * 100.0)
                        prog_prefix = f"PROGRESS: {int(prog_pct)}% | "
                        rem_frames = max(0, self.total_expected_frames - cur_total)
                        rem_sec = rem_frames / fps_proc if fps_proc > 0 else 0.0
                        eta_str = (
                            f"{int(rem_sec // 3600):02d}:"
                            f"{int((rem_sec % 3600) // 60):02d}:"
                            f"{int(rem_sec % 60):02d}"
                        )

                    telemetry_suffix = (
                        f" | FPS: {fps_proc:.1f} | ETA: {eta_str} | "
                        f"Speed: {speed_x:.2f}x | Velocidade: {fps_proc:.0f} fps"
                    )
                    if self.total_expected_frames > 0:
                        frame_str = f"Frames: {cur_total:,}/{self.total_expected_frames:,}"
                    else:
                        frame_str = f"Frames: {cur_total:,}"

                    if self.mode == "passthrough":
                        log.debug(
                            f"  -> {prog_prefix}{frame_str} | Mantidos: {cur_kept:,} "
                            f"(Passthrough Puro 100%){telemetry_suffix}"
                        )
                    elif self.mode == "freeze":
                        pct_elim = (
                            ((cur_frozen + cur_dropped) / cur_total) * 100.0
                            if cur_total > 0
                            else 0.0
                        )
                        log.debug(
                            f"  -> {prog_prefix}{frame_str} | Válidos: {cur_kept:,} | "
                            f"Congelados TBC: {cur_frozen:,} | Pretos neutralizados: "
                            f"{cur_frozen + cur_dropped:,} ({pct_elim:.1f}%){telemetry_suffix}"
                        )
                    else:
                        pct_dropped = (
                            (cur_dropped / cur_total) * 100.0 if cur_total > 0 else 0.0
                        )
                        log.debug(
                            f"  -> {prog_prefix}{frame_str} | Mantidos: {cur_kept:,} | "
                            f"Pretos descartados: {cur_dropped:,} ({pct_dropped:.1f}%){telemetry_suffix}"
                        )
        finally:
            final_stats = acc["get_stats"](time.time() - t0)
            if on_progress and int(final_stats["total_frames"]) > 0:
                try:
                    on_progress(
                        int(final_stats["total_frames"]),
                        int(final_stats["kept_frames"]),
                        int(final_stats["frozen_frames"]),
                        int(final_stats["dropped_frames"]),
                        float(final_stats["elapsed"]),
                    )
                except Exception:
                    pass

        return acc["get_stats"](time.time() - t0)
