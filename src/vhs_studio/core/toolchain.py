"""Toolchain resolver and dependency capabilities inspector for FFmpeg and external binaries."""

import shutil
import subprocess
from functools import lru_cache
from typing import Dict, Optional
from vhs_studio.core.logger import log
from vhs_studio.core.paths import (
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
    def require_panasonic_extractor(binary_name: str = "extract_meihdfs") -> str:
        """Resolve path to Panasonic extractor or raise FileNotFoundError."""
        path = get_panasonic_executable_path(binary_name)
        if path:
            return path
        raise FileNotFoundError(
            f"Panasonic extractor binary '{binary_name}' was not found in PATH or tools/panasonic_rec."
        )
