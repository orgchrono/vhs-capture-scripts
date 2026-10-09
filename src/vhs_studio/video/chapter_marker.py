"""
Chapter marking generator module for FFmpeg muxing.
Follows functional programming principles (pure transformations) and strict Separation of Concerns.
"""

import os
import subprocess
import csv
from typing import List, Tuple
from vhs_studio.core.logger import log
from vhs_studio.config.advanced import AdvancedConfig
from vhs_studio.core.constants import DEFAULT_SCENE_THRESHOLD

# ==============================================================================
# PURE FUNCTIONS (Side-effect free text and data transformations)
# ==============================================================================


def parse_scenedetect_csv(csv_content: str) -> List[Tuple[int, int]]:
    """
    Parse PySceneDetect CSV content and return a list of (start_ms, end_ms) tuples.
    Pure transformation with no I/O side effects.
    """
    lines = csv_content.strip().splitlines()
    start_idx = 0
    for i, line in enumerate(lines):
        if line.startswith("Scene Number"):
            start_idx = i + 1
            break

    scenes = []
    reader = csv.reader(lines[start_idx:])
    for row in reader:
        if len(row) >= 6:
            try:
                start_sec = float(row[3])
                end_sec = float(row[6])
                scenes.append((int(start_sec * 1000), int(end_sec * 1000)))
            except ValueError:
                continue
    return scenes


def generate_ffmetadata_text(title: str, scenes: List[Tuple[int, int]]) -> str:
    """
    Generate an FFmetadata1 formatted string from scene timestamp intervals.
    """
    lines = [";FFMETADATA1", f"title={title}", ""]
    for i, (start_ms, end_ms) in enumerate(scenes):
        lines.extend(
            [
                "[CHAPTER]",
                "TIMEBASE=1/1000",
                f"START={start_ms}",
                f"END={end_ms}",
                f"title=Cena {i+1}",
                "",
            ]
        )
    return "\n".join(lines)


# ==============================================================================
# I/O BOUND FUNCTIONS (Isolated system execution)
# ==============================================================================


def _run_scenedetect(input_video: str, threshold: float, csv_path: str) -> bool:
    """Execute PySceneDetect CLI and persist scene list to CSV."""
    try:
        subprocess.run(
            [
                "scenedetect",
                "-i",
                input_video,
                "detect-content",
                "-t",
                str(threshold),
                "list-scenes",
                "-f",
                csv_path,
            ],
            check=True,
            capture_output=True,
        )
        return os.path.exists(csv_path)
    except subprocess.CalledProcessError as e:
        log.error(
            f"[Chapters] PySceneDetect execution failed: {e.stderr.decode('utf-8', errors='ignore')}"
        )
        return False


def _run_ffmpeg_mux(input_video: str, ffmeta_path: str, output_video: str) -> bool:
    """Execute FFmpeg to embed chapter metadata stream without re-encoding video."""
    from vhs_studio.core.toolchain import Toolchain
    try:
        subprocess.run(
            [
                Toolchain.get_ffmpeg_path(),
                "-hide_banner",
                "-threads",
                "0",
                "-y",
                "-i",
                input_video,
                "-i",
                ffmeta_path,
                "-map_metadata",
                "1",
                "-c",
                "copy",
                output_video,
            ],
            check=True,
            capture_output=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        log.error(
            f"[Chapters] FFmpeg metadata muxing failed: {e.stderr.decode('utf-8', errors='ignore')}"
        )
        return False


def generate_chapters(input_video: str, output_video: str) -> bool:
    """
    Orchestrate chapter detection and lossless metadata embedding.
    """
    threshold = AdvancedConfig.get("ffmpeg", "scene_threshold", DEFAULT_SCENE_THRESHOLD)
    base_dir = os.path.dirname(input_video)
    base_name = os.path.splitext(os.path.basename(input_video))[0]

    csv_path = os.path.join(base_dir, f"{base_name}-Scenes.csv")
    ffmeta_path = os.path.join(base_dir, f"{base_name}.ffmeta")

    log.info("[Chapters] Step 1/3 - Scanning camera transitions with PySceneDetect...")
    if not _run_scenedetect(input_video, threshold, csv_path):
        return False

    log.info(
        "[Chapters] Step 2/3 - Extracting timestamps and formatting FFmetadata track..."
    )
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            csv_content = f.read()

        scenes = parse_scenedetect_csv(csv_content)
        ffmeta_content = generate_ffmetadata_text(base_name, scenes)

        with open(ffmeta_path, "w", encoding="utf-8") as f:
            f.write(ffmeta_content)
    except Exception as e:
        log.error(f"[Chapters] Failed parsing scene timestamps: {e}")
        return False

    log.info(
        "[Chapters] Step 3/3 - Losslessly embedding chapter markers into destination container..."
    )
    success = _run_ffmpeg_mux(input_video, ffmeta_path, output_video)

    # Cleanup temporary metadata files
    try:
        os.remove(csv_path)
        os.remove(ffmeta_path)
    except OSError:
        pass

    if success:
        log.info(
            f"[Chapters] Finished successfully! Output file generated: {output_video}"
        )
    return success
