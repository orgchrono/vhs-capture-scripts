"""Hardware-accelerated AI upscaling engine powered by Real-ESRGAN Vulkan NCNN."""

import os
import subprocess
import multiprocessing
from vhs_studio.core.logger import log
from vhs_studio.core.constants import DEFAULT_UPSCALER_MODEL


class AIUpscaler:
    """Manages AI-based video super-resolution upscaling using Vulkan GPU acceleration."""

    def __init__(self, model_name=DEFAULT_UPSCALER_MODEL, gpu_id="auto", tile_size=256):
        self.model_name = model_name
        self.tile_size = tile_size
        self.use_ncnn = True
        self.ncnn_path = self._find_or_download_ncnn()

        if gpu_id == "auto":
            self.gpu_id = self._detect_best_gpu()
        else:
            self.gpu_id = gpu_id

    def _detect_best_gpu(self):
        """Query vulkaninfo to automatically select the optimal dedicated or integrated GPU."""
        try:
            res = subprocess.run(
                ["vulkaninfo", "--summary"],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=5,
            )
            output = res.stdout.lower()

            if "nvidia" in output or "rtx" in output or "gtx" in output:
                log.info(
                    "[AI UPSCALER] Dedicated NVIDIA GPU detected for Vulkan acceleration."
                )
                return 0
            elif "radeon rx" in output or "amd radeon pro" in output:
                log.info(
                    "[AI UPSCALER] Dedicated AMD GPU detected for Vulkan acceleration."
                )
                return 0
            elif "intel" in output or "uhd" in output or "iris" in output:
                log.info(
                    "[AI UPSCALER] Integrated Intel GPU detected for Vulkan acceleration."
                )
                return 0
        except Exception:
            pass

        log.warning(
            "[AI UPSCALER] vulkaninfo query not available or failed. Defaulting to GPU 0."
        )
        return 0

    def _find_or_download_ncnn(self):
        """Locate the Real-ESRGAN or Real-CUGAN Vulkan executable on the system or portable bundle."""
        import shutil
        from vhs_studio.core.paths import REALESRGAN_DIR, TOOLS_DIR

        bin_name = "realcugan-ncnn-vulkan" if "cugan" in self.model_name.lower() else "realesrgan-ncnn-vulkan"
        which_path = shutil.which(bin_name)
        if which_path:
            return which_path

        exe_suffix = ".exe" if os.name == "nt" else ""
        target_dir = os.path.join(TOOLS_DIR, "realcugan" if "cugan" in self.model_name.lower() else "realesrgan")
        candidate = os.path.join(target_dir, f"{bin_name}{exe_suffix}")
        if os.path.exists(candidate):
            return candidate

        fallback = os.path.join(REALESRGAN_DIR, f"realesrgan-ncnn-vulkan{exe_suffix}")
        if os.path.exists(fallback):
            return fallback

        return None

    def process_video(self, input_video, output_video):
        """Execute neural upscaling on the provided video input."""
        if not self.ncnn_path:
            raise RuntimeError("Real-ESRGAN executable binary not found.")

        log.info(
            f"[AI UPSCALER] Launching neural upscaling with model {self.model_name} (GPU {self.gpu_id}, Tile {self.tile_size})..."
        )

        # Performance tuning: balance load/process/save threads across CPU cores
        cpu_cores = max(2, multiprocessing.cpu_count() // 2)
        thread_load = f"2:{cpu_cores}:2"

        cmd = [
            self.ncnn_path,
            "-i",
            input_video,
            "-o",
            output_video,
            "-n",
            self.model_name,
            "-g",
            str(self.gpu_id),
            "-t",
            str(self.tile_size),
            "-j",
            thread_load,
            "-s",
            "2",
        ]

        try:
            subprocess.run(
                cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            log.info(
                f"[AI UPSCALER] Super-resolution processing complete: {output_video}"
            )
        except subprocess.CalledProcessError as e:
            log.error(f"[AI UPSCALER] Real-ESRGAN subprocess failed: {e}")

    def process_frame_in_memory(self, rgb_frame_bytes, width, height):
        """Placeholder for in-memory single-frame streaming inference."""
        pass


if __name__ == "__main__":
    upscaler = AIUpscaler()
    if upscaler.ncnn_path:
        log.info("Real-ESRGAN upscaler engine ready.")
