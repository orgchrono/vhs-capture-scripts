"""Module documentation pending."""
import os
import subprocess
import multiprocessing
from vhs_studio.core.logger import log


class AIUpscaler:
    """Documentation for AIUpscaler."""
    def __init__(self, model_name="realesrgan-x4plus", gpu_id="auto"):
        """Documentation for __init__."""
        self.model_name = model_name
        self.use_ncnn = True
        self.ncnn_path = self._find_or_download_ncnn()

        if gpu_id == "auto":
            self.gpu_id = self._detect_best_gpu()
        else:
            self.gpu_id = gpu_id

    def _detect_best_gpu(self):
        """Documentation for _detect_best_gpu."""
        try:
            res = subprocess.run(
                ["vulkaninfo", "--summary"], capture_output=True, text=True, timeout=5
            )
            output = res.stdout.lower()

            if "nvidia" in output or "rtx" in output or "gtx" in output:
                log.info(
                    "[AI UPSCALER] GPU NVIDIA Dedicada detectada para aceleracao Vulkan."
                )
                return 0
            elif "radeon rx" in output or "amd radeon pro" in output:
                log.info(
                    "[AI UPSCALER] GPU AMD Dedicada detectada para aceleracao Vulkan."
                )
                return 0
            elif "intel" in output or "uhd" in output or "iris" in output:
                log.info(
                    "[AI UPSCALER] GPU Intel Integrada detectada para aceleracao Vulkan."
                )
                return 0
        except Exception:
            pass

        log.warning("[AI UPSCALER] vulkaninfo nao encontrado ou falhou. Usando GPU 0.")
        return 0

    def _find_or_download_ncnn(self):
        """Documentation for _find_or_download_ncnn."""
        from vhs_studio.core.paths import REALESRGAN_DIR

        base_dir = REALESRGAN_DIR
        exe_path = os.path.join(base_dir, "realesrgan-ncnn-vulkan.exe")

        if not os.path.exists(exe_path):
            return None
        return exe_path

    def process_video(self, input_video, output_video):
        """Documentation for process_video."""
        if not self.ncnn_path:
            raise RuntimeError("Motor ESRGAN ausente.")

        log.info(f"[AI UPSCALER] Iniciando Upscaling Neural com {self.model_name}...")

        # OTIMIZACAO DE PERFORMANCE: Threading baseado nos cores do processador
        # Por padrao ncnn-vulkan usa 1:2:2 (load:proc:save).
        # Multiplicamos isso garantindo maxima agressividade no disco e GPU sem overhead.
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
            "-j",
            thread_load,  # Threads (load:proc:save)
            "-s",
            "2",
        ]

        try:
            subprocess.run(
                cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            log.info(f"[AI UPSCALER] Upscaling de IA concluido: {output_video}")
        except subprocess.CalledProcessError as e:
            log.error(f"[AI UPSCALER] Falha ao executar RealESRGAN: {e}")

    def process_frame_in_memory(self, rgb_frame_bytes, width, height):
        """Documentation for process_frame_in_memory."""
        pass


if __name__ == "__main__":
    upscaler = AIUpscaler()
    if upscaler.ncnn_path:
        log.info("Upscaler ESRGAN pronto!")
