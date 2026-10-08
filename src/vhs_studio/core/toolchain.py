"""Module documentation pending."""

import sys
import shutil
import subprocess
from functools import lru_cache
from vhs_studio.core.logger import log
from vhs_studio.core.paths import get_ffmpeg_executable_path


class Toolchain:
    """Documentation for Toolchain."""

    @staticmethod
    def require_executable(name):
        # 1. Checa no SSOT (Portable ou Sistema adaptativo)
        """Documentation for require_executable."""
        path = get_ffmpeg_executable_path(name)
        if path:
            return path

        # 2. Checa via shutil no PATH atual
        if shutil.which(name):
            return name

        log.error(f"[ERRO FATAL] Dependência '{name}' não encontrada.")
        sys.exit(1)

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffmpeg_path():
        """Documentation for get_ffmpeg_path."""
        return Toolchain.require_executable("ffmpeg")

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffprobe_path():
        """Documentation for get_ffprobe_path."""
        return Toolchain.require_executable("ffprobe")

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffmpeg_capabilities():
        """Retorna dicionário de capacidades cacheadas do ffmpeg (encoders, filtros)."""
        ffmpeg = Toolchain.get_ffmpeg_path()
        encoders = ""
        filters = ""
        try:
            res_enc = subprocess.run(
                [ffmpeg, "-encoders"], capture_output=True, text=True
            )
            encoders = res_enc.stdout

            res_flt = subprocess.run(
                [ffmpeg, "-filters"], capture_output=True, text=True
            )
            filters = res_flt.stdout
        except Exception as e:
            log.warning(f"Falha ao obter capacidades do ffmpeg: {e}")

        return {"encoders": encoders, "filters": filters}

    @staticmethod
    def has_encoder(encoder_name):
        """Documentation for has_encoder."""
        caps = Toolchain.get_ffmpeg_capabilities()
        return (
            f" {encoder_name} " in caps["encoders"]
            or f"V..... {encoder_name} " in caps["encoders"]
        )

    @staticmethod
    def has_filter(filter_name):
        """Documentation for has_filter."""
        caps = Toolchain.get_ffmpeg_capabilities()
        return (
            f" {filter_name} " in caps["filters"]
            or f"T.. {filter_name} " in caps["filters"]
            or filter_name in caps["filters"]
        )
