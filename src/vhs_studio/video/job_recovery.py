"""Module for detecting, resuming, and managing incomplete restoration jobs and partial video files.

Scans project media directories for checkpoint files, computes restoration completeness,
and provides atomic actions for resuming interrupted processing, repairing partial video containers,
or discarding scratch files.
"""

import json
import os
import shutil
import subprocess
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

from vhs_studio.core.logger import log
from vhs_studio.core.paths import MEDIA_DIR, RESTORED_MEDIA_DIR, WORK_MEDIA_DIR
from vhs_studio.core.toolchain import Toolchain


@dataclass
class IncompleteJob:
    """Diagnostic descriptor of an interrupted or in-progress restoration job."""

    job_id: str
    source_file: str
    output_file: str
    checkpoint_file: str
    status: str  # "in_progress", "paused", "aborted", "incomplete"
    processed_frames: int
    total_expected_frames: int
    progress_percent: float
    elapsed_seconds: float
    fps: float
    output_size_bytes: int
    last_modified: str
    can_resume: bool
    source_exists: bool


def scan_incomplete_jobs() -> List[Dict[str, Any]]:
    """Scan restored and work media directories for unfinished restoration checkpoints.

    Returns:
        List of serialized IncompleteJob dictionaries suitable for frontend API transport.
    """
    search_dirs = [RESTORED_MEDIA_DIR, WORK_MEDIA_DIR, MEDIA_DIR]
    incomplete_jobs: List[IncompleteJob] = []
    seen_checkpoints = set()

    for sdir in search_dirs:
        if not os.path.exists(sdir):
            continue

        for root, _, files in os.walk(sdir):
            for fname in files:
                if not fname.endswith(".checkpoint.json"):
                    continue

                chk_path = os.path.join(root, fname)
                if chk_path in seen_checkpoints:
                    continue
                seen_checkpoints.add(chk_path)

                try:
                    with open(chk_path, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    status = str(data.get("status", "in_progress")).lower()
                    if status == "completed":
                        continue

                    source = str(data.get("source", ""))
                    dest = str(data.get("destination", ""))
                    if not dest:
                        # Fallback: derive destination by stripping .checkpoint.json
                        dest = chk_path[:-len(".checkpoint.json")]

                    processed = int(data.get("kept_frames", 0)) + int(data.get("frozen_frames", 0))
                    if processed == 0:
                        processed = int(data.get("total_frames", 0))

                    total_expected = int(data.get("total_expected_frames", 0))
                    fps = float(data.get("fps", 29.97))
                    elap = float(data.get("elapsed_seconds", 0.0))

                    dest_exists = os.path.exists(dest)
                    dest_size = os.path.getsize(dest) if dest_exists else 0
                    source_exists = os.path.exists(source) if source else False

                    pct = 0.0
                    if total_expected > 0:
                        pct = min(99.9, (processed / total_expected) * 100.0)
                    elif dest_size > 0 and source_exists:
                        # Rough estimate based on file size ratio
                        src_size = os.path.getsize(source)
                        if src_size > 0:
                            pct = min(99.9, (dest_size / src_size) * 100.0)

                    mtime = os.path.getmtime(chk_path)
                    import datetime
                    dt_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

                    job_id = os.path.splitext(os.path.basename(dest))[0]

                    incomplete_jobs.append(
                        IncompleteJob(
                            job_id=job_id,
                            source_file=source,
                            output_file=dest,
                            checkpoint_file=chk_path,
                            status=status,
                            processed_frames=processed,
                            total_expected_frames=total_expected,
                            progress_percent=round(pct, 1),
                            elapsed_seconds=round(elap, 1),
                            fps=round(fps, 2),
                            output_size_bytes=dest_size,
                            last_modified=dt_str,
                            can_resume=source_exists,
                            source_exists=source_exists,
                        )
                    )
                except Exception as e:
                    log.warning(f"[JOB RECOVERY] Could not parse checkpoint {chk_path}: {e}")

    return [asdict(j) for j in incomplete_jobs]


def finalize_partial_video(output_path: str) -> Optional[str]:
    """Repair container moov atom and index headers for an interrupted video without re-encoding.

    Uses stream-copy muxing (-c copy) to render the processed portion immediately playable.

    Args:
        output_path: Path to incomplete video file.

    Returns:
        Path to repaired playable video file, or None on error.
    """
    if not os.path.exists(output_path) or os.path.getsize(output_path) < 1024:
        log.error(f"[JOB RECOVERY] Cannot finalize missing or empty output: {output_path}")
        return None

    ffmpeg_bin = Toolchain.get_ffmpeg_path()
    base, ext = os.path.splitext(output_path)
    finalized_path = f"{base}_finalized{ext}"

    cmd = [
        ffmpeg_bin,
        "-y",
        "-err_detect",
        "ignore_err",
        "-i",
        output_path,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        finalized_path,
    ]

    log.info(f"[JOB RECOVERY] Finalizing partial stream container: {output_path} -> {finalized_path}")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=120)
        if res.returncode == 0 and os.path.exists(finalized_path) and os.path.getsize(finalized_path) > 1024:
            log.info(f"[JOB RECOVERY] Partial video finalized successfully ({os.path.getsize(finalized_path)} bytes).")
            return finalized_path
        else:
            log.warning(f"[JOB RECOVERY] Finalization remux failed with code {res.returncode}:\n{res.stderr}")
            return None
    except Exception as e:
        log.error(f"[JOB RECOVERY] Exception during video finalization: {e}")
        return None


def discard_incomplete_job(output_path: str) -> bool:
    """Safely remove partial artifacts, checkpoints, and locks associated with an interrupted job."""
    chk_path = f"{output_path}.checkpoint.json"
    files_to_remove = [output_path, chk_path, f"{output_path}.tmp", f"{chk_path}.tmp"]

    success = True
    for f in files_to_remove:
        if os.path.exists(f):
            try:
                os.remove(f)
                log.info(f"[JOB RECOVERY] Removed partial artifact: {f}")
            except Exception as e:
                log.error(f"[JOB RECOVERY] Failed removing {f}: {e}")
                success = False

    return success
