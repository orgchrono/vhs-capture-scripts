import os
import sys
import shutil
import subprocess
from functools import lru_cache
from vhs_studio.core.logger import log


class Toolchain:
    @staticmethod
    def require_executable(name, winget_path=None):
        if winget_path and os.path.exists(winget_path):
            return winget_path
        if shutil.which(name):
            return name

        log.error(f"[ERRO FATAL] Dependência '{name}' não encontrada no sistema.")
        if winget_path:
            log.error(
                f"Por favor, instale o {name} e adicione-o ao PATH do Windows, ou instale via WinGet."
            )
        else:
            log.error(f"Por favor, instale o {name} e adicione-o ao PATH do Windows.")
        sys.exit(1)

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffmpeg_path():
        winget_path = os.path.expandvars(
            r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe"
        )
        return Toolchain.require_executable("ffmpeg", winget_path)

    @staticmethod
    @lru_cache(maxsize=1)
    def get_ffprobe_path():
        winget_path = os.path.expandvars(
            r"%LOCALAPPDATA%\Microsoft\WinGet\Links\ffprobe.exe"
        )
        return Toolchain.require_executable("ffprobe", winget_path)

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
        caps = Toolchain.get_ffmpeg_capabilities()
        return (
            f" {encoder_name} " in caps["encoders"]
            or f"V..... {encoder_name} " in caps["encoders"]
        )

    @staticmethod
    def has_filter(filter_name):
        caps = Toolchain.get_ffmpeg_capabilities()
        return (
            f" {filter_name} " in caps["filters"]
            or f"T.. {filter_name} " in caps["filters"]
            or filter_name in caps["filters"]
        )
