"""Module for detecting, resuming, and managing incomplete restoration jobs and partial video files.

Scans project media directories for checkpoint files, computes restoration completeness,
and provides atomic actions for resuming interrupted processing, repairing partial video containers,
or discarding scratch files.
"""

import datetime
import json
import os
import shutil
import subprocess
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Set

from vhs_studio.core.constants import VALID_MEDIA_EXTENSIONS
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


def resolve_physical_target_file(path: str) -> Optional[str]:
    """Resolve the real physical file on disk (handling .part suffixes, hashes, etc.)."""
    if not path:
        return None
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    if os.path.exists(f"{path}.part") and os.path.getsize(f"{path}.part") > 0:
        return f"{path}.part"
    parent = os.path.dirname(path)
    if os.path.exists(parent):
        base = os.path.basename(path)
        base_stem, _ = os.path.splitext(base)
        clean_stem = base_stem.split("_restored")[0] if "_restored" in base_stem else base_stem
        try:
            for f in os.listdir(parent):
                if f.startswith(clean_stem) and f.endswith(".part"):
                    cand = os.path.join(parent, f)
                    if os.path.isfile(cand) and os.path.getsize(cand) > 0:
                        return cand
        except Exception:
            pass
    return None


def scan_incomplete_jobs() -> List[Dict[str, Any]]:
    """Scan restored and work media directories for unfinished restoration checkpoints and partial video files.

    Returns:
        List of serialized IncompleteJob dictionaries suitable for frontend API transport.
    """
    search_dirs = [RESTORED_MEDIA_DIR, WORK_MEDIA_DIR]
    incomplete_jobs: List[IncompleteJob] = []
    seen_checkpoints = set()
    seen_output_files: Set[str] = set()

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

                    real_dest = resolve_physical_target_file(dest) or dest
                    dest_exists = os.path.exists(real_dest)
                    dest_size = os.path.getsize(real_dest) if dest_exists else 0
                    source_exists = os.path.exists(source) if source else False

                    seen_output_files.add(os.path.normpath(real_dest).lower())
                    seen_output_files.add(os.path.normpath(dest).lower())
                    seen_output_files.add(os.path.normpath(f"{dest}.part").lower())

                    if total_expected == 0 and source_exists:
                        try:
                            from vhs_studio.core.vhs_common import probe_media
                            s_info = probe_media(source)
                            s_dur = float(s_info.get("duration", 0.0))
                            s_fps = float(s_info.get("fps", fps or 29.97))
                            if s_dur > 0 and s_fps > 0:
                                total_expected = int(s_dur * s_fps)
                        except Exception:
                            pass

                    pct = 0.0
                    if total_expected > 0 and processed > 0:
                        pct = min(100.0, (processed / total_expected) * 100.0)
                    elif dest_size > 0 and source_exists:
                        src_size = os.path.getsize(source)
                        if src_size > 0:
                            pct = min(90.0, (dest_size / src_size) * 50.0)

                    mtime = os.path.getmtime(chk_path)
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

    # Pass 2: scan for orphan .part files not accounted for in checkpoints
    for sdir in search_dirs:
        if not os.path.exists(sdir):
            continue

        for root, _, files in os.walk(sdir):
            for fname in files:
                if not fname.endswith(".part"):
                    continue

                part_path = os.path.join(root, fname)
                norm_part = os.path.normpath(part_path).lower()
                if norm_part in seen_output_files:
                    continue
                seen_output_files.add(norm_part)

                try:
                    dest_size = os.path.getsize(part_path)
                    if dest_size < 1024:
                        continue

                    clean_name = fname[:-len(".part")]
                    raw_stem = clean_name.split("_restored")[0]
                    folder_name = os.path.basename(root)

                    source_file = ""
                    source_exists = False
                    for rdir in [os.path.join(MEDIA_DIR, "raw"), MEDIA_DIR, WORK_MEDIA_DIR]:
                        if not os.path.exists(rdir):
                            continue
                        for cand in os.listdir(rdir):
                            cand_stem, cand_ext = os.path.splitext(cand)
                            if cand_ext.lower() in VALID_MEDIA_EXTENSIONS:
                                if cand_stem == raw_stem or cand_stem == folder_name or raw_stem.startswith(cand_stem):
                                    full_cand = os.path.join(rdir, cand)
                                    if os.path.isfile(full_cand):
                                        source_file = full_cand
                                        source_exists = True
                                        break
                        if source_exists:
                            break

                    pct = 0.0
                    if source_exists:
                        src_size = os.path.getsize(source_file)
                        if src_size > 0:
                            pct = min(90.0, (dest_size / src_size) * 50.0)

                    mtime = os.path.getmtime(part_path)
                    dt_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                    job_id = os.path.splitext(os.path.basename(clean_name))[0]
                    target_output = os.path.join(root, clean_name)

                    incomplete_jobs.append(
                        IncompleteJob(
                            job_id=job_id,
                            source_file=source_file,
                            output_file=target_output,
                            checkpoint_file="",
                            status="incomplete",
                            processed_frames=0,
                            total_expected_frames=0,
                            progress_percent=round(pct, 1),
                            elapsed_seconds=0.0,
                            fps=29.97,
                            output_size_bytes=dest_size,
                            last_modified=dt_str,
                            can_resume=source_exists,
                            source_exists=source_exists,
                        )
                    )
                except Exception as e:
                    log.warning(f"[JOB RECOVERY] Could not inspect partial file {part_path}: {e}")

    return [asdict(j) for j in incomplete_jobs]


def finalize_partial_video(output_path: str) -> Optional[str]:
    """Repair container moov atom and index headers for an interrupted video without re-encoding.

    Uses stream-copy muxing (-c copy) to render the processed portion immediately playable.

    Args:
        output_path: Path to incomplete video file or base output path.

    Returns:
        Path to repaired playable video file, or None on error.
    """
    real_input = resolve_physical_target_file(output_path)
    if not real_input or os.path.getsize(real_input) < 1024:
        log.error(f"[JOB RECOVERY] Cannot finalize missing or empty output: {output_path}")
        return None

    ffmpeg_bin = Toolchain.get_ffmpeg_path()
    input_to_remux = real_input
    base_clean = real_input[:-len(".part")] if real_input.endswith(".part") else real_input
    base, ext = os.path.splitext(base_clean)
    finalized_path = f"{base}_finalized{ext}"

    cmd = [
        ffmpeg_bin,
        "-y",
        "-err_detect",
        "ignore_err",
        "-i",
        input_to_remux,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        finalized_path,
    ]

    log.info(f"[JOB RECOVERY] Finalizing partial stream container: {input_to_remux} -> {finalized_path}")
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
    files_to_remove = [
        output_path,
        chk_path,
        f"{output_path}.tmp",
        f"{chk_path}.tmp",
        f"{output_path}.part",
        f"{output_path}.log",
    ]

    parent = os.path.dirname(output_path)
    if os.path.exists(parent):
        base_stem, _ = os.path.splitext(os.path.basename(output_path))
        clean_prefix = base_stem.split("_restored")[0] if "_restored" in base_stem else base_stem
        try:
            for f in os.listdir(parent):
                if f.startswith(clean_prefix) and (f.endswith(".part") or f.endswith(".tmp") or f.endswith(".log")):
                    files_to_remove.append(os.path.join(parent, f))
        except Exception:
            pass

    success = True
    for f in set(files_to_remove):
        if os.path.exists(f):
            try:
                os.remove(f)
                log.info(f"[JOB RECOVERY] Removed partial artifact: {f}")
            except Exception as e:
                log.error(f"[JOB RECOVERY] Failed removing {f}: {e}")
                success = False

    return success


def check_existing_restoration(source_file: str) -> Optional[Dict[str, Any]]:
    """Check if an active incomplete job, partial .part file, or finished restoration exists for a source tape."""
    if not source_file:
        return None

    source_stem = os.path.splitext(os.path.basename(source_file))[0].lower()
    norm_source = os.path.normpath(source_file).lower()

    # 1. Check incomplete jobs
    for job in scan_incomplete_jobs():
        job_source = os.path.normpath(job.get("source_file", "")).lower()
        job_id = job.get("job_id", "").lower()
        if job_source == norm_source or source_stem in job_source or source_stem in job_id:
            return {
                "exists": True,
                "type": "partial",
                "file_path": job.get("output_file", ""),
                "size_bytes": job.get("output_size_bytes", 0),
                "can_resume": job.get("can_resume", False),
                "progress_percent": job.get("progress_percent", 0.0),
                "last_modified": job.get("last_modified", ""),
            }

    # 2. Check completed video in RESTORED_MEDIA_DIR
    if os.path.exists(RESTORED_MEDIA_DIR):
        for root, _, files in os.walk(RESTORED_MEDIA_DIR):
            for fname in files:
                if fname.lower().endswith((".mp4", ".mov", ".mkv")) and not fname.endswith(".part"):
                    if source_stem in fname.lower():
                        fpath = os.path.join(root, fname)
                        try:
                            sz = os.path.getsize(fpath)
                            if sz > 1024:
                                mtime = os.path.getmtime(fpath)
                                dt_str = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
                                return {
                                    "exists": True,
                                    "type": "completed",
                                    "file_path": fpath,
                                    "size_bytes": sz,
                                    "can_resume": False,
                                    "progress_percent": 100.0,
                                    "last_modified": dt_str,
                                }
                        except Exception:
                            pass
    return None
