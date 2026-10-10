"""Neural optical flow frame interpolation engine (RIFE-NCNN) for 60fps restoration."""

import os
import shutil
import subprocess
from typing import Optional
from vhs_studio.core.logger import log
from vhs_studio.core.constants import DEFAULT_RIFE_TARGET_FPS, DEFAULT_RIFE_MODEL


class RifeInterpolator:
    """Manages motion interpolation to double framerate using RIFE neural optical flow."""

    def __init__(self, target_fps: float = DEFAULT_RIFE_TARGET_FPS, model_name: str = DEFAULT_RIFE_MODEL):
        self.target_fps = target_fps
        self.model_name = model_name
        self.rife_bin = self._find_rife_executable()

    def _find_rife_executable(self) -> Optional[str]:
        """Locate rife-ncnn-vulkan executable."""
        which_path = shutil.which("rife-ncnn-vulkan")
        if which_path:
            return which_path

        from vhs_studio.core.paths import TOOLS_DIR
        candidate = os.path.join(TOOLS_DIR, "rife", "rife-ncnn-vulkan.exe" if os.name == "nt" else "rife-ncnn-vulkan")
        if os.path.exists(candidate):
            return candidate
        return None

    def is_available(self) -> bool:
        """Check if RIFE Vulkan binary is present."""
        return self.rife_bin is not None

    def interpolate_video(self, input_video: str, output_video: str) -> bool:
        """Execute RIFE interpolation on video file."""
        if not self.rife_bin:
            log.warning("[RIFE] Binário rife-ncnn-vulkan não encontrado no sistema.")
            return False

        log.info(f"[RIFE] Iniciando interpolação de movimento para {self.target_fps:.0f} fps...")
        cmd = [
            self.rife_bin,
            "-i", input_video,
            "-o", output_video,
            "-m", self.model_name,
            "-g", "0",
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, errors="replace", check=True)
            return res.returncode == 0
        except Exception as e:
            log.error(f"[RIFE] Falha na interpolação RIFE: {e}")
            return False
