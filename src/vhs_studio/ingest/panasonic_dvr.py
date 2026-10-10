"""Panasonic DVR and MEIHDFS filesystem ingestion engine.

Provides automated signature inspection, superblock detection, and title extraction
supporting Panasonic DIGA DVD/HDD formats (MEIHDFS-V1.0, MEIHDFS-V2.0, DVD-VR, and MPEG-2 PS).
Integrates with external toolchain binaries (extract_meihdfs) and includes a pure-Python
stream carver fallback.
"""

import os
import subprocess
from dataclasses import dataclass, field
from typing import Callable, List, Optional
from vhs_studio.core.logger import log
from vhs_studio.core.paths import RAW_MEDIA_DIR
from vhs_studio.core.toolchain import Toolchain


@dataclass
class PanasonicInspectionResult:
    """Structured inspection diagnostics for Panasonic DVR media or disk images."""

    is_panasonic: bool
    format: str
    details: str
    can_extract: bool
    toolchain_available: bool
    extractor_binary: Optional[str]
    source_size_bytes: int
    detected_offsets: List[int] = field(default_factory=list)
    estimated_titles: int = 0


# Signatures used by Panasonic DVR recorders
SIG_MEIHDFS_V2 = b"MEIHDFS-V2.0"
SIG_MEIHDFS_V1 = b"MEIHDFS-V1.0"
SIG_MEIHDFS_GENERIC = b"MEIHDFS"
SIG_DVD_VR_MANGR = b"VR_MANGR.IFO"
SIG_DVD_VR_MOVIE = b"VR_MOVIE.VRO"
SIG_DVD_RTAV = b"DVD_RTAV"
MPEG2_PACK_HEADER = b"\x00\x00\x01\xba"
MPEG2_SYS_HEADER = b"\x00\x00\x01\xbb"
MPEG2_VIDEO_PACKET = b"\x00\x00\x01\xe0"

# Header probe size (read up to 4MB for filesystem header discovery)
PROBE_CHUNK_SIZE = 4 * 1024 * 1024


def inspect_panasonic_source(source_path: str) -> PanasonicInspectionResult:
    """Analyze a disk image, raw dump, or storage source for Panasonic DVR filesystem structures.

    Args:
        source_path: Path to disk image (.img, .raw, .bin, .vro) or block source.

    Returns:
        PanasonicInspectionResult containing format classification and recovery viability.
    """
    if not os.path.exists(source_path):
        return PanasonicInspectionResult(
            is_panasonic=False,
            format="NOT_FOUND",
            details=f"Source path '{source_path}' does not exist.",
            can_extract=False,
            toolchain_available=False,
            extractor_binary=None,
            source_size_bytes=0,
        )

    try:
        source_size = os.path.getsize(source_path)
    except Exception:
        source_size = 0

    toolchain_bin = Toolchain.get_panasonic_extractor_path()
    toolchain_available = toolchain_bin is not None

    detected_offsets: List[int] = []
    detected_format = "UNKNOWN"
    details = "No recognizable Panasonic DVR signatures found."
    is_panasonic = False
    estimated_titles = 0

    try:
        with open(source_path, "rb") as f:
            data = f.read(PROBE_CHUNK_SIZE)
    except Exception as e:
        log.error(f"[PANASONIC INGEST] Failed reading source '{source_path}': {e}")
        return PanasonicInspectionResult(
            is_panasonic=False,
            format="READ_ERROR",
            details=f"Error reading source: {e}",
            can_extract=False,
            toolchain_available=toolchain_available,
            extractor_binary=toolchain_bin,
            source_size_bytes=source_size,
        )

    # 1. Check for MEIHDFS Superblocks (V2.0 and V1.0)
    if SIG_MEIHDFS_V2 in data:
        is_panasonic = True
        detected_format = "MEIHDFS-V2.0"
        offset = data.find(SIG_MEIHDFS_V2)
        detected_offsets.append(offset)
        # Count occurrences in probed header
        count = data.count(SIG_MEIHDFS_V2)
        estimated_titles = max(1, count)
        details = (
            f"Panasonic MEIHDFS-V2.0 Superblock detected at offset 0x{offset:X}. "
            f"DIGA HDD Recorder partition identified."
        )
    elif SIG_MEIHDFS_V1 in data:
        is_panasonic = True
        detected_format = "MEIHDFS-V1.0"
        offset = data.find(SIG_MEIHDFS_V1)
        detected_offsets.append(offset)
        count = data.count(SIG_MEIHDFS_V1)
        estimated_titles = max(1, count)
        details = (
            f"Panasonic MEIHDFS-V1.0 Superblock detected at offset 0x{offset:X}. "
            f"Legacy DIGA DMR-E series filesystem identified."
        )
    elif SIG_MEIHDFS_GENERIC in data:
        is_panasonic = True
        detected_format = "MEIHDFS"
        offset = data.find(SIG_MEIHDFS_GENERIC)
        detected_offsets.append(offset)
        details = f"Generic Panasonic MEIHDFS signature detected at offset 0x{offset:X}."
    # 2. Check for DVD-VR / UDF Directory Signatures
    elif SIG_DVD_VR_MANGR in data or SIG_DVD_RTAV in data or SIG_DVD_VR_MOVIE in data:
        is_panasonic = True
        detected_format = "DVD-VR"
        offset = max(
            data.find(SIG_DVD_VR_MANGR),
            data.find(SIG_DVD_RTAV),
            data.find(SIG_DVD_VR_MOVIE),
        )
        if offset >= 0:
            detected_offsets.append(offset)
        estimated_titles = 1
        details = "Panasonic DVD-VR / DVD_RTAV volume structure detected."
    # 3. Check for raw MPEG-2 Program Stream headers (DVD-RAM / VRO stream)
    elif MPEG2_PACK_HEADER in data:
        pack_count = data.count(MPEG2_PACK_HEADER)
        if pack_count >= 5:
            is_panasonic = True
            detected_format = "MPEG2-PS-STREAM"
            offset = data.find(MPEG2_PACK_HEADER)
            detected_offsets.append(offset)
            details = (
                f"Valid MPEG-2 Program Stream pack headers detected ({pack_count} packs found in first {len(data)}B). "
                f"Recoverable via stream carver."
            )
            estimated_titles = 1

    can_extract = is_panasonic

    return PanasonicInspectionResult(
        is_panasonic=is_panasonic,
        format=detected_format,
        details=details,
        can_extract=can_extract,
        toolchain_available=toolchain_available,
        extractor_binary=toolchain_bin,
        source_size_bytes=source_size,
        detected_offsets=detected_offsets,
        estimated_titles=estimated_titles,
    )


def carve_mpeg2_streams(
    source_path: str,
    output_dir: str,
    log_callback: Optional[Callable[[str], None]] = None,
    max_titles: int = 50,
) -> List[str]:
    """Pure-Python portable stream carver for extracting MPEG-2 Program Streams from raw disk dumps.

    Args:
        source_path: Path to disk image or raw dump.
        output_dir: Destination directory for recovered media streams.
        log_callback: Optional callback for streaming status messages.
        max_titles: Safety cap on number of carved files.

    Returns:
        List of absolute file paths to extracted video streams.
    """
    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(source_path))[0]
    extracted_files: List[str] = []

    def emit(msg: str):
        log.info(f"[PANASONIC CARVER] {msg}")
        if log_callback:
            log_callback(msg)

    emit(f"Starting pure-Python MPEG-2 stream carving on: {source_path}")

    BUFFER_SIZE = 4 * 1024 * 1024  # 4MB buffer

    title_index = 1
    current_out = None
    current_out_path = ""
    current_bytes_written = 0
    consecutive_non_packs = 0
    MAX_GAP_BYTES = 512 * 1024  # 512KB gap tolerance before splitting title

    try:
        with open(source_path, "rb") as src:
            while title_index <= max_titles:
                chunk = src.read(BUFFER_SIZE)
                if not chunk:
                    break

                pos = 0
                chunk_len = len(chunk)
                while pos < chunk_len:
                    # Look for MPEG2 pack header
                    idx = chunk.find(MPEG2_PACK_HEADER, pos)
                    if idx == -1:
                        # Pack not found in this segment
                        consecutive_non_packs += (chunk_len - pos)
                        if current_out and consecutive_non_packs >= MAX_GAP_BYTES:
                            emit(
                                f"Stream gap detected ({consecutive_non_packs} bytes). "
                                f"Closing Title {title_index:02d} ({current_bytes_written // (1024 * 1024)} MB)."
                            )
                            current_out.close()
                            current_out = None
                            title_index += 1
                        break

                    # If we found a pack after a large non-pack gap, close previous title
                    if consecutive_non_packs >= MAX_GAP_BYTES and current_out:
                        current_out.close()
                        current_out = None
                        title_index += 1

                    consecutive_non_packs = 0

                    if current_out is None:
                        current_out_path = os.path.join(
                            output_dir, f"{base_name}_title_{title_index:02d}.mpg"
                        )
                        current_out = open(current_out_path, "wb")
                        current_bytes_written = 0
                        extracted_files.append(current_out_path)
                        emit(f"Carving new Title {title_index:02d} -> {os.path.basename(current_out_path)}")

                    # Write from idx to next boundary or chunk end
                    next_idx = chunk.find(MPEG2_PACK_HEADER, idx + 4)
                    if next_idx != -1:
                        write_len = next_idx - idx
                        current_out.write(chunk[idx:idx + write_len])
                        current_bytes_written += write_len
                        pos = next_idx
                    else:
                        # Write remainder of chunk
                        write_len = chunk_len - idx
                        current_out.write(chunk[idx:])
                        current_bytes_written += write_len
                        pos = chunk_len

        if current_out:
            current_out.close()
            emit(
                f"Finished carving Title {title_index:02d} ({current_bytes_written // (1024 * 1024)} MB)."
            )

    except Exception as e:
        emit(f"Error during stream carving: {e}")
        if current_out:
            try:
                current_out.close()
            except Exception:
                pass

    # Filter out files smaller than 128KB (empty or spurious fragments)
    valid_files: List[str] = []
    for fpath in extracted_files:
        if os.path.exists(fpath) and os.path.getsize(fpath) >= 128 * 1024:
            valid_files.append(fpath)
        elif os.path.exists(fpath):
            try:
                os.remove(fpath)
            except Exception:
                pass

    emit(f"Carving complete. Total valid video titles extracted: {len(valid_files)}")
    return valid_files


def extract_panasonic_media(
    source_path: str,
    output_dir: Optional[str] = None,
    log_callback: Optional[Callable[[str], None]] = None,
) -> List[str]:
    """Execute media extraction from Panasonic DVR source to destination directory.

    Attempts native binary extraction if extract_meihdfs toolchain binary is available;
    falls back to pure-Python MPEG-2 stream carver if binary is absent or fails.

    Args:
        source_path: Absolute or safe path to Panasonic DVR source file/image.
        output_dir: Target directory (defaults to media/raw/).
        log_callback: Status logger callback.

    Returns:
        List of generated media files placed into destination directory.
    """
    dest_dir = output_dir or RAW_MEDIA_DIR
    os.makedirs(dest_dir, exist_ok=True)

    def emit(msg: str):
        log.info(f"[PANASONIC INGEST] {msg}")
        if log_callback:
            log_callback(msg)

    emit(f"Preparing Panasonic ingestion for: {source_path}")
    toolchain_bin = Toolchain.get_panasonic_extractor_path()

    if toolchain_bin:
        emit(f"Using Toolchain binary: {toolchain_bin}")
        cmd = [toolchain_bin, source_path, dest_dir]
        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=300,
            )
            if res.stdout:
                for line in res.stdout.splitlines():
                    if line.strip():
                        emit(line.strip())
            if res.returncode == 0:
                emit("Toolchain binary extraction completed successfully.")
                # Locate newly generated files in dest_dir
                candidates = [
                    os.path.join(dest_dir, fname)
                    for fname in os.listdir(dest_dir)
                    if fname.lower().endswith((".mpg", ".vro", ".mkv", ".ts"))
                ]
                return candidates
            else:
                emit(f"Toolchain binary exited with code {res.returncode}. Engaging pure-Python carver fallback...")
        except Exception as e:
            emit(f"Toolchain binary execution failed ({e}). Engaging pure-Python carver fallback...")

    # Fallback: Run stream carver
    return carve_mpeg2_streams(source_path, dest_dir, log_callback=log_callback)
