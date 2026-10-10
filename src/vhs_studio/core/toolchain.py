import json
import os
import platform
import shutil
import subprocess
from functools import lru_cache
from typing import Dict, Optional, Tuple
from vhs_studio.archive.fixity import FixityChecker
from vhs_studio.core.logger import log
from vhs_studio.core.paths import (
    PANASONIC_TOOLS_DIR,
    get_ffmpeg_executable_path,
    get_panasonic_executable_path,
)


class Toolchain:
    """Manages executable discovery, PATH resolution, and codec/filter capability detection."""

    @staticmethod
    def require_executable(name: str) -> str:
        """Resolve path to requested executable or exit cleanly if absent."""
        # 1. Inspect dedicated portable paths
        path = get_ffmpeg_executable_path(name)
        if path:
            return path

        # 2. Check system PATH via shutil
        which_path = shutil.which(name)
        if which_path:
            return which_path

        log.error(
            f"[FATAL] Required executable '{name}' was not found in PATH or portable bundle."
        )
        raise FileNotFoundError(
            f"Required executable '{name}' was not found in PATH or portable bundle."
        )

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffmpeg_path() -> str:
        """Return cached path to FFmpeg binary."""
        return Toolchain.require_executable("ffmpeg")

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffprobe_path() -> str:
        """Return cached path to FFprobe binary."""
        return Toolchain.require_executable("ffprobe")

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffmpeg_capabilities() -> Dict[str, str]:
        """Return dictionary of supported FFmpeg encoders and filters."""
        ffmpeg = Toolchain.get_ffmpeg_path()
        encoders = ""
        filters = ""
        try:
            res_enc = subprocess.run(
                [ffmpeg, "-encoders"],
                capture_output=True,
                text=True,
                errors="replace",
            )
            encoders = res_enc.stdout

            res_flt = subprocess.run(
                [ffmpeg, "-filters"],
                capture_output=True,
                text=True,
                errors="replace",
            )
            filters = res_flt.stdout
        except Exception as e:
            log.warning(f"Failed querying FFmpeg capabilities: {e}")

        return {"encoders": encoders, "filters": filters}

    @staticmethod
    def has_encoder(encoder_name: str) -> bool:
        """Return True if specified encoder is compiled into FFmpeg build."""
        caps = Toolchain.get_ffmpeg_capabilities()
        return (
            f" {encoder_name} " in caps["encoders"]
            or f"V..... {encoder_name} " in caps["encoders"]
        )

    @staticmethod
    def has_filter(filter_name: str) -> bool:
        """Return True if specified video/audio filter is compiled into FFmpeg build."""
        caps = Toolchain.get_ffmpeg_capabilities()
        return (
            f" {filter_name} " in caps["filters"]
            or f"T.. {filter_name} " in caps["filters"]
            or filter_name in caps["filters"]
        )

    @staticmethod
    def get_panasonic_extractor_path(binary_name: str = "extract_meihdfs") -> Optional[str]:
        """Return path to Panasonic recovery binary if portable or available in PATH."""
        return get_panasonic_executable_path(binary_name)

    @staticmethod
    def is_panasonic_extractor_available(binary_name: str = "extract_meihdfs") -> bool:
        """Check whether Panasonic recovery extractor binary is available."""
        return get_panasonic_executable_path(binary_name) is not None

    @staticmethod
    def get_dvd_vr_path() -> Optional[str]:
        """Return path to dvd-vr binary if portable or available in PATH."""
        return get_panasonic_executable_path("dvd-vr")

    @staticmethod
    def is_dvd_vr_available() -> bool:
        """Check whether dvd-vr binary is available."""
        return get_panasonic_executable_path("dvd-vr") is not None

    @staticmethod
    def get_udf_dump_path() -> Optional[str]:
        """Return path to udf_dump binary if portable or available in PATH."""
        return get_panasonic_executable_path("udf_dump")

    @staticmethod
    def is_udf_dump_available() -> bool:
        """Check whether udf_dump binary is available."""
        return get_panasonic_executable_path("udf_dump") is not None

    @staticmethod
    def require_panasonic_extractor(binary_name: str = "extract_meihdfs") -> str:
        """Resolve path to Panasonic extractor or raise FileNotFoundError."""
        path = get_panasonic_executable_path(binary_name)
        if path:
            return path
        raise FileNotFoundError(
            f"Panasonic extractor binary '{binary_name}' was not found in PATH or tools/panasonic_rec."
        )

    @staticmethod
    def verify_panasonic_binary_integrity(binary_name: str = "extract_meihdfs") -> Tuple[bool, str]:
        """Verify the cryptographic SHA-256 hash of a Panasonic recovery binary against checksums.json.

        Returns:
            Tuple[bool, str]: (is_valid, status_or_hash_message)
        """
        path = get_panasonic_executable_path(binary_name)
        if not path or not os.path.exists(path):
            return False, f"Binary '{binary_name}' not found."

        manifest_path = os.path.join(PANASONIC_TOOLS_DIR, "checksums.json")
        if not os.path.exists(manifest_path):
            return True, "No fixity manifest found; integrity check skipped."

        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
        except Exception as e:
            return False, f"Failed reading checksums manifest: {e}"

        sys_name = platform.system()
        platform_key = "windows-x64" if sys_name == "Windows" else f"{sys_name.lower()}-{platform.machine().lower()}"
        known_bins = manifest.get("binaries", {}).get(platform_key, {})

        bin_filename = os.path.basename(path)
        if bin_filename not in known_bins:
            # Locally compiled or unindexed platform binary
            return True, f"Binary '{bin_filename}' is locally compiled (not in pre-compiled manifest)."

        expected_hash = known_bins[bin_filename].get("sha256", "").lower()
        actual_hash = FixityChecker.calculate_sha256(path).lower()

        if actual_hash != expected_hash:
            msg = (
                f"INTEGRITY MISMATCH for '{bin_filename}': "
                f"expected {expected_hash}, calculated {actual_hash}"
            )
            log.error(f"[SECURITY] {msg}")
            return False, msg

        return True, f"Verified SHA-256: {actual_hash}"

    @staticmethod
    def require_verified_panasonic_extractor(binary_name: str = "extract_meihdfs") -> str:
        """Resolve path to Panasonic extractor, verifying its SHA-256 fixity before execution."""
        path = Toolchain.require_panasonic_extractor(binary_name)
        is_valid, msg = Toolchain.verify_panasonic_binary_integrity(binary_name)
        if not is_valid:
            raise PermissionError(f"Security validation failed for '{binary_name}': {msg}")
        return path
