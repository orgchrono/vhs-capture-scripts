import os
import sys
import subprocess
import numpy as np
from lib.logger import log

class AIUpscaler:
    """
    Integração de AI Upscaling via código (ESRGAN) de forma 100% gratuita.
    Utiliza ONNXRuntime ou o binário realesrgan-ncnn-vulkan para aceleração de GPU sem depender de software pago.
    """
    
    def __init__(self, model_name="realesrgan-x4plus", gpu_id=0):
        self.model_name = model_name
        self.gpu_id = gpu_id
        self.use_ncnn = True
        self.ncnn_path = self._find_or_download_ncnn()

    def _find_or_download_ncnn(self):
        """
        Localiza ou instrui o download do realesrgan-ncnn-vulkan, que é a forma
        mais eficiente, rápida e gratuita de rodar ESRGAN em qualquer placa de vídeo (AMD/NVIDIA/Intel).
        """
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "realesrgan"))
        exe_path = os.path.join(base_dir, "realesrgan-ncnn-vulkan.exe")
        
        if not os.path.exists(exe_path):
            log.warning("[AI UPSCALER] O motor gratuito RealESRGAN-NCNN-Vulkan nao foi encontrado.")
            log.info("Para usar upscale de IA gratuito, baixe a ultima versao em: https://github.com/xinntao/Real-ESRGAN/releases")
            log.info(f"E extraia o executavel em: {base_dir}")
            return None
        return exe_path

    def process_video(self, input_video, output_video):
        """
        Processa o vídeo usando ESRGAN via ncnn-vulkan.
        O binário ncnn-vulkan já suporta entrada de vídeo diretamente nas versões mais recentes.
        """
        if not self.ncnn_path:
            raise RuntimeError("Motor ESRGAN ausente. Impossivel realizar upscaling via IA.")
            
        log.info(f"[AI UPSCALER] Iniciando Upscaling Neural com {self.model_name}...")
        
        cmd = [
            self.ncnn_path,
            "-i", input_video,
            "-o", output_video,
            "-n", self.model_name,
            "-g", str(self.gpu_id),
            "-s", "2" # Fator de escala 2x (pode ser ajustado)
        ]
        
        try:
            # Roda o ESRGAN
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info(f"[AI UPSCALER] Upscaling de IA concluído com sucesso: {output_video}")
        except subprocess.CalledProcessError as e:
            log.error(f"[AI UPSCALER] Falha ao executar RealESRGAN: {e}")

    def process_frame_in_memory(self, rgb_frame_bytes, width, height):
        """
        Placeholder para processamento em memória Frame-by-Frame usando PyTorch/ONNX.
        Requer: pip install realesrgan torch torchvision opencv-python
        """
        try:
            import cv2
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer
        except ImportError:
            raise ImportError("Para processamento in-memory via código, instale: pip install realesrgan torch torchvision opencv-python")

        # Converte bytes brutos para array NumPy
        frame = np.frombuffer(rgb_frame_bytes, dtype=np.uint8).reshape((height, width, 3))
        
        # Inicializa o modelo (apenas na primeira chamada em um loop real)
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
        upsampler = RealESRGANer(scale=4, model_path='weights/RealESRGAN_x4plus.pth', model=model, tile=0, tile_pad=10, pre_pad=0, half=True)
        
        output, _ = upsampler.enhance(frame, outscale=2)
        return output.tobytes()

if __name__ == "__main__":
    upscaler = AIUpscaler()
    if upscaler.ncnn_path:
        log.info("Upscaler ESRGAN configurado e pronto para uso!")
