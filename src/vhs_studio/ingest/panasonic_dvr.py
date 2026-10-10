"""Panasonic DVR and MEIHDFS filesystem ingestion engine.

Provides automated signature inspection, superblock detection, and title extraction
supporting Panasonic DIGA DVD/HDD formats (MEIHDFS-V1.0, MEIHDFS-V2.0, DVD-VR, and MPEG-2 PS).
Integrates with external toolchain binaries (extract_meihdfs) and includes a pure-Python
stream carver fallback.
"""

import os
import sys
import json
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple, Dict, Any
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
    can_extract = False
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

    # 0. Check for Panasonic Service / Firmware Boot Dump (e.g. 100MB DMR-EH55 image)
    fname_lower = os.path.basename(source_path).lower()
    is_firmware_name = "firmware" in fname_lower and (
        "hdd" in fname_lower or "panasonic" in fname_lower
    )
    is_firmware_size = source_size == 104857600

    if (is_firmware_size or is_firmware_name) and not any(
        s in data for s in [SIG_MEIHDFS_V2, SIG_MEIHDFS_V1, MPEG2_PACK_HEADER]
    ):
        is_panasonic = True
        detected_format = "PANASONIC_FIRMWARE_SERVICE_IMAGE"
        details = (
            "Panasonic DMR-EH55 Service Bootloader / Firmware image (100MB HDD replacement image). "
            "Contains SuperH SH-4 bootloader code used for initializing replacement hard drives; "
            "not a video recording partition."
        )
        can_extract = False
    # 1. Check for MEIHDFS Superblocks (V2.0 and V1.0)
    elif SIG_MEIHDFS_V2 in data:
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
        can_extract = True
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
        can_extract = True
    elif SIG_MEIHDFS_GENERIC in data:
        is_panasonic = True
        detected_format = "MEIHDFS"
        offset = data.find(SIG_MEIHDFS_GENERIC)
        detected_offsets.append(offset)
        details = f"Generic Panasonic MEIHDFS signature detected at offset 0x{offset:X}."
        can_extract = True
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
        can_extract = True
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
            can_extract = True

    # 4. Deep probe known Panasonic DVR partition offsets if not found in first chunk
    if not is_panasonic and source_size > PROBE_CHUNK_SIZE:
        known_offsets = [0x01600000, 0x16000000, 0xA4000000]
        try:
            with open(source_path, "rb") as f:
                for ko in known_offsets:
                    if ko + 1024 <= source_size:
                        f.seek(ko)
                        blk = f.read(65536)
                        if SIG_MEIHDFS_V2 in blk or b"HDFS2." in blk:
                            is_panasonic = True
                            detected_format = "MEIHDFS-V2.0"
                            sub_off = blk.find(SIG_MEIHDFS_V2)
                            if sub_off < 0:
                                sub_off = blk.find(b"HDFS2.")
                            actual_off = ko + max(0, sub_off)
                            detected_offsets.append(actual_off)
                            details = (
                                f"Panasonic MEIHDFS-V2.0 Superblock detected at offset 0x{actual_off:X}. "
                                f"DIGA HDD Recorder partition identified."
                            )
                            estimated_titles = 1
                            can_extract = True
                            break
        except Exception as e:
            log.warning(f"Failed deep offset probe on {source_path}: {e}")

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


def extract_panasonic_media(
    source_path: str,
    output_dir: Optional[str] = None,
    log_callback: Optional[Callable[[str], None]] = None,
) -> List[str]:
    """Execute media extraction from Panasonic DVR source to destination directory.

    Utilizes the high-performance native C toolchain (extract_meihdfs and dvd-vr)
    to parse MEIHDFS filesystem inodes and metadata accurately without risky disk carving.

    Args:
        source_path: Absolute or safe path to Panasonic DVR source file/image/disk.
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

    if not toolchain_bin:
        msg = (
            "Native toolchain binary 'extract_meihdfs' is not available. "
            "Please compile tools using 'python scripts/build_panasonic_tools.py' with GCC/Clang."
        )
        emit(msg)
        return []

    emit(f"Using native toolchain binary: {toolchain_bin}")
    staging_dir = os.path.join(dest_dir, f"_panasonic_stage_{os.getpid()}")
    os.makedirs(staging_dir, exist_ok=True)
    cmd = [toolchain_bin, source_path, staging_dir]
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=600,
        )
        if res.stdout:
            for line in res.stdout.splitlines():
                if line.strip():
                    emit(line.strip())
        if res.returncode == 0:
            emit("extract_meihdfs completed successfully. Searching for files...")
            dvd_vr_bin = Toolchain.get_dvd_vr_path()
            vro_found = False

            for root, _, files in os.walk(staging_dir):
                for fname in files:
                    if fname.upper().endswith(".VRO"):
                        vro_found = True
                        vro_path = os.path.join(root, fname)
                        base = os.path.splitext(fname)[0]
                        ifo_path = os.path.join(root, f"{base}.IFO")
                        if not os.path.exists(ifo_path):
                            ifo_path = os.path.join(root, "VR_MANGR.IFO")
                        if os.path.exists(ifo_path) and dvd_vr_bin:
                            emit(f"Demuxing titles with dvd-vr from {fname}...")
                            try:
                                res_vr = subprocess.run(
                                    [dvd_vr_bin, "-n", "[ts]_[pgm]", ifo_path, vro_path],
                                    cwd=dest_dir,
                                    capture_output=True,
                                    text=True,
                                    errors="replace",
                                    timeout=600,
                                    check=False,
                                )
                                if res_vr.stdout:
                                    for vl in res_vr.stdout.splitlines():
                                        if vl.strip():
                                            emit(f"[dvd-vr] {vl.strip()}")
                            except Exception as vr_err:
                                emit(f"dvd-vr demux warning: {vr_err}")

            candidates = [
                os.path.join(dest_dir, fname)
                for fname in os.listdir(dest_dir)
                if fname.lower().endswith((".vob", ".mpg", ".vro", ".mkv", ".ts"))
            ]

            # Fallback to copying .VRO if dvd-vr didn't emit titles
            if not candidates and vro_found:
                for root, _, files in os.walk(staging_dir):
                    for fname in files:
                        if fname.lower().endswith((".vro", ".mpg")):
                            target = os.path.join(dest_dir, fname)
                            shutil.copy2(os.path.join(root, fname), target)
                            candidates.append(target)

            shutil.rmtree(staging_dir, ignore_errors=True)
            if candidates:
                emit(f"Native recovery completed: {len(candidates)} media file(s) extracted.")
                return candidates
        else:
            shutil.rmtree(staging_dir, ignore_errors=True)
            emit(f"Native toolchain binary exited with code {res.returncode}: {res.stderr.strip() if res.stderr else ''}")
    except Exception as e:
        shutil.rmtree(staging_dir, ignore_errors=True)
        emit(f"Native toolchain binary execution failed ({e}).")

    return []


def detect_connected_disks() -> List[Dict[str, Any]]:
    """Scan connected physical drives across Windows, Linux, and macOS.

    Probes each drive for Panasonic DVR MEIHDFS/DVD-VR signatures to enable
    1-click detection and automated extraction.
    """
    disks: List[Dict[str, Any]] = []

    if sys.platform == "win32":
        try:
            cmd = [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_DiskDrive | Select-Object DeviceID, Model, Size | ConvertTo-Json",
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if res.returncode == 0 and res.stdout.strip():
                parsed = json.loads(res.stdout.strip())
                items = parsed if isinstance(parsed, list) else [parsed]
                for item in items:
                    dev_id = str(item.get("DeviceID") or "")
                    model = str(item.get("Model") or "Hard Disk Drive")
                    size_b = int(item.get("Size") or 0)
                    size_gb = round(size_b / (1024**3), 1)

                    is_pana, fmt, needs_elev = _probe_disk_for_panasonic(dev_id)
                    disks.append({
                        "device_id": dev_id,
                        "name": f"{model} ({size_gb} GB)",
                        "model": model,
                        "size_gb": size_gb,
                        "is_panasonic": is_pana,
                        "format": fmt,
                        "needs_elevation": needs_elev,
                    })
        except Exception as e:
            log.warning(f"[PANASONIC INGEST] Windows disk detection warning: {e}")

    elif sys.platform == "darwin":
        try:
            res = subprocess.run(["diskutil", "list"], capture_output=True, text=True, timeout=10)
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    if line.startswith("/dev/disk"):
                        parts = line.split()
                        dev_num = parts[0].replace("/dev/disk", "")
                        rdisk_path = f"/dev/rdisk{dev_num}"
                        is_pana, fmt, needs_elev = _probe_disk_for_panasonic(rdisk_path)
                        disks.append({
                            "device_id": rdisk_path,
                            "name": f"Physical Disk {dev_num}",
                            "model": "Apple/External Storage",
                            "size_gb": 0.0,
                            "is_panasonic": is_pana,
                            "format": fmt,
                            "needs_elevation": needs_elev,
                        })
        except Exception as e:
            log.warning(f"[PANASONIC INGEST] macOS disk detection warning: {e}")

    elif sys.platform.startswith("linux"):
        try:
            cmd = ["lsblk", "-J", "-b", "-o", "NAME,PATH,MODEL,SIZE,TYPE"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout)
                for dev in data.get("blockdevices", []):
                    if dev.get("type") in ("disk", "rom"):
                        p = dev.get("path") or f"/dev/{dev.get('NAME')}"
                        model = str(dev.get("model") or "Block Device").strip()
                        size_b = int(dev.get("size") or 0)
                        size_gb = round(size_b / (1024**3), 1)
                        is_pana, fmt, needs_elev = _probe_disk_for_panasonic(p)
                        disks.append({
                            "device_id": p,
                            "name": f"{model} ({size_gb} GB)",
                            "model": model,
                            "size_gb": size_gb,
                            "is_panasonic": is_pana,
                            "format": fmt,
                            "needs_elevation": needs_elev,
                        })
        except Exception as e:
            log.warning(f"[PANASONIC INGEST] Linux disk detection warning: {e}")

    return disks


def _probe_disk_for_panasonic(device_path: str) -> Tuple[bool, str, bool]:
    """Probe the first sectors of a block device for Panasonic signatures without altering data."""
    try:
        with open(device_path, "rb") as f:
            header = f.read(65536)
            if SIG_MEIHDFS_V2 in header:
                return True, "MEIHDFS-V2.0", False
            if SIG_MEIHDFS_V1 in header:
                return True, "MEIHDFS-V1.0", False
            if SIG_MEIHDFS_GENERIC in header:
                return True, "MEIHDFS", False
            if any(s in header for s in (SIG_DVD_VR_MANGR, SIG_DVD_RTAV, SIG_DVD_VR_MOVIE)):
                return True, "DVD-VR", False
            if header.count(MPEG2_PACK_HEADER) >= 3:
                return True, "MPEG2-PS", False
            return False, "UNKNOWN", False
    except PermissionError:
        return False, "REQUIRES_ADMIN", True
    except Exception:
        return False, "UNKNOWN", False
