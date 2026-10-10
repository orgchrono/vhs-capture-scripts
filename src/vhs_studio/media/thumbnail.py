"""Smart cross-platform video thumbnail generator.

Samples video frames beginning strictly from frame 0 (no hardcoded skip time),
evaluating dynamic luminance, variance, Laplacian sharpness, and human face detection
to produce the most representative preview frame for the tape library.
"""

import hashlib
import os
import subprocess
from typing import Any, List, Optional, Tuple
import cv2  # type: ignore
import numpy as np  # type: ignore

from vhs_studio.core.logger import log
from vhs_studio.core.paths import VHS_STUDIO_DIR
from vhs_studio.core.toolchain import Toolchain

THUMBNAILS_DIR = os.path.join(VHS_STUDIO_DIR, "thumbnails")

# Preload Haar Cascade for face detection if available in OpenCV bundle
_FACE_CASCADE: Optional[Any] = None


def _get_face_cascade() -> Optional[Any]:
    """Lazy initialize and cache Haar Cascade frontal face classifier."""
    global _FACE_CASCADE
    if _FACE_CASCADE is None:
        try:
            data_attr = getattr(cv2, "data", None)
            haarcascades = getattr(data_attr, "haarcascades", "") if data_attr else ""
            cascade_path = os.path.join(haarcascades, "haarcascade_frontalface_default.xml")
            if os.path.exists(cascade_path):
                classifier_cls = getattr(cv2, "CascadeClassifier", None)
                if classifier_cls:
                    _FACE_CASCADE = classifier_cls(cascade_path)
        except Exception as e:
            log.debug(f"[THUMBNAIL] OpenCV Haar cascade initialization notice: {e}")
            _FACE_CASCADE = None
    return _FACE_CASCADE


def get_thumbnail_path_for_video(video_path: str) -> str:
    """Compute deterministic cache file path for video thumbnail based on path, size and mtime."""
    os.makedirs(THUMBNAILS_DIR, exist_ok=True)
    try:
        stat = os.stat(video_path)
        ident = f"{os.path.abspath(video_path)}_{stat.st_mtime}_{stat.st_size}"
    except Exception:
        ident = os.path.abspath(video_path)

    hash_key = hashlib.sha256(ident.encode("utf-8")).hexdigest()[:16]
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    # Clean filename for filesystem compatibility
    safe_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_"))[:32]
    return os.path.join(THUMBNAILS_DIR, f"{safe_name}_{hash_key}.jpg")


def _evaluate_frame_candidate(
    frame: np.ndarray,
    face_cascade: Optional[Any],
) -> Tuple[float, bool]:
    """Score a candidate video frame based on luminance, sharpness and face presence.

    Returns:
        Tuple of (score, has_face). Negative score implies rejected blank/flash frame.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_luma = float(np.mean(gray))
    std_luma = float(np.std(gray))

    # Reject near-black leader (mean < 18), blown-out white flash (mean > 240), or flat screens (std < 10)
    if mean_luma < 18.0 or mean_luma > 240.0 or std_luma < 10.0:
        return -1000.0, False

    # Calculate sharpness via Laplacian variance
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    sharpness = float(laplacian.var())

    # Face detection bonus
    has_face = False
    face_bonus = 0.0
    if face_cascade is not None and not face_cascade.empty():
        try:
            # Downscale for ultra-fast face detection
            h, w = gray.shape[:2]
            scale = 320.0 / max(w, 1)
            small_w = max(1, int(w * scale))
            small_h = max(1, int(h * scale))
            small_gray = cv2.resize(gray, (small_w, small_h), interpolation=cv2.INTER_AREA)

            faces = face_cascade.detectMultiScale(
                small_gray,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(24, 24),
            )
            if len(faces) > 0:
                has_face = True
                face_bonus = 600.0 + (len(faces) * 150.0)
        except Exception:
            pass

    # Score balances sharpness, contrast, and high bonus for human faces
    contrast_factor = 1.0 - abs(mean_luma - 128.0) / 128.0
    total_score = sharpness + (15.0 * contrast_factor) + face_bonus
    return total_score, has_face


def _generate_via_ffmpeg_fallback(video_path: str, output_path: str) -> bool:
    """Fallback generator extracting candidate frame via FFmpeg when OpenCV decoding fails."""
    try:
        ffmpeg_bin = Toolchain.get_ffmpeg_path()
        cmd = [
            ffmpeg_bin,
            "-y",
            "-ss",
            "00:00:01",
            "-i",
            video_path,
            "-vframes",
            "1",
            "-vf",
            "scale=320:-1",
            "-q:v",
            "3",
            output_path,
        ]
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=15,
        )
        return res.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        log.warning(f"[THUMBNAIL] FFmpeg thumbnail fallback failed: {e}")
        return False


def generate_smart_thumbnail(
    video_path: str,
    output_path: Optional[str] = None,
    max_samples: int = 24,
) -> Optional[str]:
    """Generate representative thumbnail starting from frame 0 with dynamic sharpness & face scoring.

    Args:
        video_path: Path to raw or processed video file.
        output_path: Destination path for JPEG. Defaults to cached thumbnail path.
        max_samples: Number of candidate frames evaluated across the video length.

    Returns:
        Path to thumbnail image file or None if generation failed.
    """
    if not os.path.exists(video_path):
        return None

    target_path = output_path or get_thumbnail_path_for_video(video_path)
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
        return target_path

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    face_cascade = _get_face_cascade()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        log.debug(f"[THUMBNAIL] OpenCV failed opening '{video_path}'. Engaging FFmpeg fallback.")
        success = _generate_via_ffmpeg_fallback(video_path, target_path)
        return target_path if success else None

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            total_frames = 1000

        # Sample grid starting strictly at frame 0 and spreading across timeline
        sample_indices: List[int] = [
            int(i * (total_frames - 1) / max(1, max_samples - 1))
            for i in range(max_samples)
        ]

        best_frame: Optional[np.ndarray] = None
        best_score = -1e9
        fallback_frame: Optional[np.ndarray] = None

        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            if fallback_frame is None:
                fallback_frame = frame.copy()

            score, has_face = _evaluate_frame_candidate(frame, face_cascade)
            if score > best_score:
                best_score = score
                best_frame = frame
                # If we detected a crisp frame with a human face and high sharpness, early return
                if has_face and score > 800.0:
                    break

        selected = best_frame if best_frame is not None else fallback_frame
        if selected is None:
            log.warning(f"[THUMBNAIL] No decodable frames in '{video_path}'. Trying FFmpeg...")
            success = _generate_via_ffmpeg_fallback(video_path, target_path)
            return target_path if success else None

        # Resize selected frame to standard preview dimension (width 320, keep aspect ratio)
        h, w = selected.shape[:2]
        thumb_w = 320
        thumb_h = max(1, int(h * (thumb_w / max(1, w))))
        thumb = cv2.resize(selected, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA)

        # Write JPEG with high visual fidelity
        cv2.imwrite(target_path, thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        return target_path

    except Exception as e:
        log.warning(f"[THUMBNAIL] Error generating thumbnail for '{video_path}': {e}")
        success = _generate_via_ffmpeg_fallback(video_path, target_path)
        return target_path if success else None
    finally:
        cap.release()
