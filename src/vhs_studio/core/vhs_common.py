"""Unified Python core library for the VHS Studio Pro pipeline.

Provides technical stream inspection (ffprobe/idet), no-signal frame classification
(analog black and VCR/TBC blue-screen), audio layout detection, and cross-platform
pipeline strategy resolution.
"""

import os
import json
import re
from typing import Dict, Any, Optional, Tuple
from vhs_studio.core.constants import (
    BLUE_SCREEN_CB_MIN,
    BLUE_SCREEN_CR_MAX,
    BLUE_SCREEN_LUMA_MAX,
    BLUE_SCREEN_LUMA_MIN,
    BT601_CHROMA_NEUTRAL,
    DEFAULT_AUDIO_CHANNELS,
    DEFAULT_AUDIO_SAMPLE_RATE,
    DEFAULT_LUMA_THRESHOLD,
    DEFAULT_NTSC_FPS,
    NTSC_HEIGHT,
    NTSC_WIDTH,
)
from vhs_studio.core.logger import log
from vhs_studio.core.system_process import run_silent
from vhs_studio.core.toolchain import Toolchain


def probe_media(file_path: str) -> Dict[str, Any]:
    """Deeply inspect media file using ffprobe and return parsed metadata."""
    ffprobe = Toolchain.get_ffprobe_path()
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file_path,
    ]
    res = run_silent(cmd, capture_output=True, text=True, errors="replace")
    if res.returncode != 0:
        raise RuntimeError(
            f"ffprobe failed inspecting '{file_path}': {res.stderr.strip()}"
        )

    data = json.loads(res.stdout)
    v_stream: Dict[str, Any] = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"), {}
    )
    a_stream: Dict[str, Any] = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {}
    )

    w = int(v_stream.get("width", NTSC_WIDTH))
    h = int(v_stream.get("height", NTSC_HEIGHT))

    r_fps = v_stream.get("r_frame_rate", "30000/1001")
    if "/" in r_fps:
        num, den = r_fps.split("/")
        fps = float(num) / float(den) if float(den) > 0 else DEFAULT_NTSC_FPS
    else:
        fps = float(r_fps) if r_fps else DEFAULT_NTSC_FPS

    duration = float(data.get("format", {}).get("duration", 0.0))
    if duration == 0.0 and "duration" in v_stream:
        duration = float(v_stream.get("duration", 0.0))

    v_codec = v_stream.get("codec_name", "unknown")
    a_codec = a_stream.get("codec_name", "none")
    a_channels = int(a_stream.get("channels", DEFAULT_AUDIO_CHANNELS)) if a_stream else 0
    a_sample_rate = (
        int(a_stream.get("sample_rate", DEFAULT_AUDIO_SAMPLE_RATE)) if a_stream else 0
    )

    field_order = v_stream.get("field_order", "unknown")

    return {
        "file_path": file_path,
        "width": w,
        "height": h,
        "fps": fps,
        "fps_rational": r_fps,
        "duration": duration,
        "video_codec": v_codec,
        "audio_codec": a_codec,
        "audio_channels": a_channels,
        "audio_sample_rate": a_sample_rate,
        "field_order": field_order,
        "pix_fmt": v_stream.get("pix_fmt", "yuv420p"),
        "color_space": v_stream.get("color_space", "smpte170m"),
        "color_primaries": v_stream.get("color_primaries", "smpte170m"),
        "color_transfer": v_stream.get("color_transfer", "smpte170m"),
        "format": data.get("format", {}).get("format_name", ""),
    }


def detect_interlace_status(
    file_path: str, num_frames: int = 300, start_sec: Optional[float] = None
) -> Dict[str, Any]:
    """Run FFmpeg 'idet' filter over a media segment to determine whether the signal
    is genuinely interlaced (TFF/BFF) or progressive.
    """
    ffmpeg = Toolchain.get_ffmpeg_path()

    if start_sec is None:
        try:
            meta = probe_media(file_path)
            dur = meta.get("duration", 0.0)
            start_sec = 15.0 if dur > 25.0 else 0.0
        except Exception:
            start_sec = 0.0

    cmd = [
        ffmpeg,
        "-hide_banner",
        "-ss",
        str(start_sec),
        "-i",
        file_path,
        "-vf",
        "idet",
        "-vframes",
        str(num_frames),
        "-an",
        "-f",
        "null",
        "-",
    ]
    res = run_silent(cmd, capture_output=True, text=True, errors="replace")
    stderr = res.stderr

    multi_matches = list(
        re.finditer(
            r"Multi frame detection:\s+TFF:\s*(\d+)\s+BFF:\s*(\d+)\s+Progressive:\s*(\d+)\s+Undetermined:\s*(\d+)",
            stderr,
        )
    )
    single_matches = list(
        re.finditer(
            r"Single frame detection:\s+TFF:\s*(\d+)\s+BFF:\s*(\d+)\s+Progressive:\s*(\d+)\s+Undetermined:\s*(\d+)",
            stderr,
        )
    )

    for m in reversed(multi_matches + single_matches):
        tff = int(m.group(1))
        bff = int(m.group(2))
        prog = int(m.group(3))
        undet = int(m.group(4))
        total = tff + bff + prog + undet

        if total > 0:
            if undet > total * 0.85 and start_sec > 0:
                return detect_interlace_status(
                    file_path, num_frames=num_frames, start_sec=0.0
                )

            is_interlaced = (tff + bff) > prog
            order = "bff" if bff >= tff else "tff"
            summary_label = f"Interlaced ({order.upper()})" if is_interlaced else "Progressive"
            return {
                "detected": True,
                "is_interlaced": is_interlaced,
                "preferred_order": order,
                "tff_count": tff,
                "bff_count": bff,
                "progressive_count": prog,
                "undetermined_count": undet,
                "summary": f"{summary_label} ({tff} TFF, {bff} BFF, {prog} Prog, {undet} Undet)",
            }

    return {
        "detected": False,
        "is_interlaced": False,
        "preferred_order": "bff",
        "summary": "Inconclusive detection",
    }


def detect_audio_layout(
    file_path: str, sample_sec: float = 15.0, sample_duration: float = 5.0
) -> Dict[str, Any]:
    """Analyze RMS volume levels per channel to detect mono-left, mono-right,
    dual-mono, or true stereo layouts.
    """
    ffmpeg = Toolchain.get_ffmpeg_path()
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-ss",
        str(sample_sec),
        "-t",
        str(sample_duration),
        "-i",
        file_path,
        "-af",
        "astats",
        "-f",
        "null",
        "-",
    ]
    res = run_silent(cmd, capture_output=True, text=True, errors="replace")
    stderr = res.stderr

    ch1_match = re.search(
        r"Channel: 1.*?RMS level dB:\s*(-?[\d\.]+)", stderr, re.DOTALL
    )
    ch2_match = re.search(
        r"Channel: 2.*?RMS level dB:\s*(-?[\d\.]+)", stderr, re.DOTALL
    )

    if ch1_match and ch2_match:
        rms1 = float(ch1_match.group(1))
        rms2 = float(ch2_match.group(1))

        if rms2 < -55.0 and rms1 > -45.0:
            return {
                "detected": True,
                "layout": "mono_l",
                "rms_l": rms1,
                "rms_r": rms2,
                "recommendation": "duplicate_l_to_r",
                "reason": f"Right channel is muted ({rms2:.1f} dB) while Left has signal ({rms1:.1f} dB).",
            }
        if rms1 < -55.0 and rms2 > -45.0:
            return {
                "detected": True,
                "layout": "mono_r",
                "rms_l": rms1,
                "rms_r": rms2,
                "recommendation": "duplicate_r_to_l",
                "reason": f"Left channel is muted ({rms1:.1f} dB) while Right has signal ({rms2:.1f} dB).",
            }
        if abs(rms1 - rms2) < 0.8 and rms1 > -50.0:
            return {
                "detected": True,
                "layout": "dual_mono",
                "rms_l": rms1,
                "rms_r": rms2,
                "recommendation": "passthrough",
                "reason": f"Left and Right channels are identical (L: {rms1:.1f} dB, R: {rms2:.1f} dB).",
            }
        return {
            "detected": True,
            "layout": "stereo",
            "rms_l": rms1,
            "rms_r": rms2,
            "recommendation": "passthrough",
            "reason": f"True stereo detected (L: {rms1:.1f} dB, R: {rms2:.1f} dB).",
        }

    return {
        "detected": False,
        "layout": "stereo",
        "rms_l": 0.0,
        "rms_r": 0.0,
        "recommendation": "passthrough",
        "reason": "Inconclusive audio analysis (preserving default stereo).",
    }


def resolve_pipeline_strategy(
    meta: Dict[str, Any],
    interlace_info: Dict[str, Any],
    audio_info: Dict[str, Any],
    user_fps: Optional[float] = None,
    user_deint: Optional[str] = None,
    user_audio: Optional[str] = None,
    interactive: object = False,
) -> Dict[str, Any]:
    """Consolidate technical detections with optional user overrides into a canonical pipeline strategy."""
    raw_fps = float(meta.get("fps", DEFAULT_NTSC_FPS))
    is_interlaced = bool(interlace_info.get("is_interlaced", False))
    preferred_order = str(interlace_info.get("preferred_order", "bff"))

    ambiguity_reasons = []

    if user_fps:
        target_fps = float(user_fps)
    elif raw_fps >= 45.0:
        target_fps = raw_fps
    elif raw_fps < 35.0:
        target_fps = (raw_fps * 2.0) if is_interlaced else raw_fps
    else:
        target_fps = raw_fps
        ambiguity_reasons.append(f"Unusual FPS detected: {raw_fps:.2f}")

    if user_deint:
        need_deinterlace = (user_deint == "force") or (
            user_deint == "auto" and is_interlaced
        )
    else:
        if raw_fps >= 45.0 and not is_interlaced:
            need_deinterlace = False
        elif raw_fps < 35.0 and is_interlaced:
            need_deinterlace = True
        elif raw_fps >= 45.0 and is_interlaced:
            ambiguity_reasons.append(
                f"Conflict: High framerate ({raw_fps:.2f} fps) but idet indicates interlacing."
            )
            need_deinterlace = False
        else:
            need_deinterlace = is_interlaced

    if user_audio:
        audio_policy = user_audio
    else:
        rec = audio_info.get("recommendation", "passthrough")
        if rec == "duplicate_l_to_r":
            audio_policy = "mono_l"
        elif rec == "duplicate_r_to_l":
            audio_policy = "mono_r"
        else:
            audio_policy = "stereo"

    if interactive and (ambiguity_reasons or interactive == "always"):
        log.info("============================================================")
        log.info("[INTERACTIVE PIPELINE STRATEGY AUDIT]")
        log.info(f"  File: {meta.get('file_path')}")
        log.info(
            f"  Native FPS: {raw_fps:.3f} | Resolution: {meta.get('width')}x{meta.get('height')}"
        )
        log.info(f"  Idet Status: {interlace_info.get('summary')}")
        log.info(f"  Audio: {audio_info.get('reason')}")
        if ambiguity_reasons:
            log.warning("  Ambiguity warnings:")
            for a in ambiguity_reasons:
                log.warning(f"    - {a}")
        log.info("\nSelect processing mode:")
        deint_label = "Yes" if need_deinterlace else "No"
        log.info(
            f"  [1] Recommended: FPS {target_fps:.3f} | Deinterlace: {deint_label} | Audio: {audio_policy}"
        )
        log.info("  [2] Force NTSC 29.97i -> 59.94p (Double-Rate BWDIF/QTGMC)")
        log.info("  [3] Force Direct Progressive (Skip deinterlacing, keep native FPS)")
        log.info("  [4] Force PAL 25i -> 50p")
        try:
            choice = input("Choose an option [1-4] (Enter for 1): ").strip()
            if choice == "2":
                target_fps = 59.94
                need_deinterlace = True
                preferred_order = "bff"
            elif choice == "3":
                target_fps = raw_fps
                need_deinterlace = False
            elif choice == "4":
                target_fps = 50.0
                need_deinterlace = True
                preferred_order = "tff"
        except (EOFError, KeyboardInterrupt):
            pass
        log.info("============================================================\n")

    return {
        "raw_fps": raw_fps,
        "target_fps": target_fps,
        "need_deinterlace": need_deinterlace,
        "preferred_order": preferred_order,
        "audio_policy": audio_policy,
        "ambiguity": len(ambiguity_reasons) > 0,
        "ambiguity_details": ambiguity_reasons,
    }


def is_no_signal_frame(
    mean_luma: float,
    mean_cb: float = float(BT601_CHROMA_NEUTRAL),
    mean_cr: float = float(BT601_CHROMA_NEUTRAL),
) -> Tuple[bool, str]:
    """Return True and classification label if frame corresponds to:
    1. Analog signal loss / tape leader black: Y <= DEFAULT_LUMA_THRESHOLD (18.0)
    2. VCR / Panasonic TBC blue screen on sync loss:
       Luma in [20.0, 85.0], high Cb (>= 165.0), and low Cr (<= 115.0).
    """
    if mean_luma <= DEFAULT_LUMA_THRESHOLD:
        return True, "black"
    if (
        BLUE_SCREEN_LUMA_MIN <= mean_luma <= BLUE_SCREEN_LUMA_MAX
        and mean_cb >= BLUE_SCREEN_CB_MIN
        and mean_cr <= BLUE_SCREEN_CR_MAX
    ):
        return True, "blue_screen"
    return False, "normal"


def write_manifest(manifest_path: str, data: Dict[str, Any]) -> None:
    """Write session manifest as formatted JSON."""
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def read_manifest(manifest_path: str) -> Optional[Dict[str, Any]]:
    """Read session manifest JSON if it exists."""
    if not os.path.exists(manifest_path):
        return None
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)
