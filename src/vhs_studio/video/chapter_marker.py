"""
chapter_marker.py - Módulo FP/SRP para embutir marcações de capítulo via FFmpeg.
Seguindo princípios de FP Pure (Pure Functions para transformação de texto) e SRP.
"""

import os
import subprocess
import csv
from typing import List, Tuple
from vhs_studio.core.logger import log
from vhs_studio.config.advanced import AdvancedConfig

# ==============================================================================
# PURE FUNCTIONS (Sem Side Effects - FP Pure, SRP)
# ==============================================================================


def parse_scenedetect_csv(csv_content: str) -> List[Tuple[int, int]]:
    """
    [Pure Function] Lê o conteúdo raw do CSV e retorna uma lista de tuplas
    (start_ms, end_ms) livre de side-effects.
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
    [Pure Function] Recebe metadados e retorna a string no formato FFmetadata.
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
# I/O BOUND FUNCTIONS (Side Effects contidos - SOC)
# ==============================================================================


def _run_scenedetect(input_video: str, threshold: float, csv_path: str) -> bool:
    """[I/O] Executa o PySceneDetect e escreve o CSV no disco."""
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
            f"[Capítulos] Falha no scenedetect: {e.stderr.decode('utf-8', errors='ignore')}"
        )
        return False


def _run_ffmpeg_mux(input_video: str, ffmeta_path: str, output_video: str) -> bool:
    """[I/O] Executa o FFmpeg para embutir os metadados no arquivo final."""
    try:
        subprocess.run(
            [
                "ffmpeg",
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
            f"[Capítulos] Falha no FFmpeg: {e.stderr.decode('utf-8', errors='ignore')}"
        )
        return False


def generate_chapters(input_video: str, output_video: str) -> bool:
    """
    [Orquestrador] Função principal que delega I/O e Transformações Puras.
    """
    threshold = AdvancedConfig.get("ffmpeg", "scene_threshold", 27.0)
    base_dir = os.path.dirname(input_video)
    base_name = os.path.splitext(os.path.basename(input_video))[0]

    csv_path = os.path.join(base_dir, f"{base_name}-Scenes.csv")
    ffmeta_path = os.path.join(base_dir, f"{base_name}.ffmeta")

    log.info(f"[Capítulos] 1/3 - Escaneando cortes de câmera com PySceneDetect...")
    if not _run_scenedetect(input_video, threshold, csv_path):
        return False

    log.info("[Capítulos] 2/3 - Extraindo metadados e gerando trilha (FP Pure)...")
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            csv_content = f.read()

        # Pure transformations
        scenes = parse_scenedetect_csv(csv_content)
        ffmeta_content = generate_ffmetadata_text(base_name, scenes)

        with open(ffmeta_path, "w", encoding="utf-8") as f:
            f.write(ffmeta_content)
    except Exception as e:
        log.error(f"[Capítulos] Falha ao processar dados puros: {e}")
        return False

    log.info("[Capítulos] 3/3 - Embutindo capítulos no vídeo final (Lossless)...")
    success = _run_ffmpeg_mux(input_video, ffmeta_path, output_video)

    # Limpeza I/O
    try:
        os.remove(csv_path)
        os.remove(ffmeta_path)
    except OSError:
        pass

    if success:
        log.info(f"[Capítulos] Concluído! Arquivo final gerado: {output_video}")
    return success
