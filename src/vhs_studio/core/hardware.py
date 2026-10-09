"""Hardware detection, system profiling, and honest AI performance capability tiering."""

import os
import platform
import shutil
import subprocess
from typing import Dict, Any
from vhs_studio.core.constants import TIER_4_MIN_VRAM_GB, TIER_2_MIN_CPU_CORES


def get_ram_info() -> Dict[str, float]:
    """Retrieve system total and available RAM in Gigabytes without external dependencies."""
    total_gb = 8.0
    avail_gb = 4.0

    sys_name = platform.system()
    if sys_name == "Windows":
        try:
            import ctypes
            mem = (ctypes.c_ulonglong * 8)()
            mem[0] = 64
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
                total_gb = round(mem[1] / (1024 ** 3), 1)
                avail_gb = round(mem[2] / (1024 ** 3), 1)
        except Exception:
            pass
    elif sys_name == "Linux":
        try:
            with open("/proc/meminfo", "r", encoding="utf-8") as f:
                mem_data = {}
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        mem_data[parts[0].strip()] = parts[1].strip()
                if "MemTotal" in mem_data:
                    total_kb = float(mem_data["MemTotal"].split()[0])
                    total_gb = round(total_kb / (1024 ** 2), 1)
                if "MemAvailable" in mem_data:
                    avail_kb = float(mem_data["MemAvailable"].split()[0])
                    avail_gb = round(avail_kb / (1024 ** 2), 1)
        except Exception:
            pass
    elif sys_name == "Darwin":
        try:
            out = subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()
            total_gb = round(float(out) / (1024 ** 3), 1)
            avail_gb = round(total_gb * 0.5, 1)
        except Exception:
            pass

    return {"total_gb": total_gb, "available_gb": avail_gb}


def detect_gpu_info() -> Dict[str, Any]:
    """Inspect GPU hardware via Vulkan, NVIDIA-SMI, and system probes."""
    gpu_type = "cpu_only"
    gpu_name = "Nenhum (Renderização via CPU)"
    vulkan_ok = False
    vram_gb = 0.0

    # 1. Check Vulkan
    if shutil.which("vulkaninfo"):
        try:
            res = subprocess.run(["vulkaninfo", "--summary"], capture_output=True, text=True, timeout=3)
            if res.returncode == 0:
                vulkan_ok = True
                lines = res.stdout.splitlines()
                for line in lines:
                    line_lower = line.lower()
                    if "devicename" in line_lower:
                        parts = line.split("=")
                        if len(parts) == 2:
                            gpu_name = parts[1].strip()
                    if "devicetype" in line_lower:
                        if "discrete_gpu" in line_lower:
                            gpu_type = "dedicated"
                        elif "integrated_gpu" in line_lower:
                            gpu_type = "integrated"
        except Exception:
            pass

    # 2. Check NVIDIA SMI for dedicated NVIDIA VRAM
    if shutil.which("nvidia-smi"):
        try:
            res = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=3
            )
            if res.returncode == 0 and res.stdout.strip():
                gpu_type = "dedicated"
                parts = res.stdout.strip().splitlines()[0].split(",")
                gpu_name = parts[0].strip()
                if len(parts) > 1:
                    vram_gb = round(float(parts[1].strip()) / 1024.0, 1)
        except Exception:
            pass

    # 3. macOS Apple Silicon
    if platform.system() == "Darwin" and platform.machine() in ["arm64", "aarch64"]:
        gpu_type = "apple_silicon"
        gpu_name = "Apple Silicon GPU (Metal Unified Memory)"

    return {
        "type": gpu_type,
        "name": gpu_name,
        "vulkan_available": vulkan_ok,
        "vram_gb": vram_gb,
    }


def get_hardware_profile() -> Dict[str, Any]:
    """Assemble complete hardware capability analysis and honest AI performance tiering."""
    cpu_cores = os.cpu_count() or 4
    cpu_arch = platform.machine()
    ram_info = get_ram_info()
    gpu_info = detect_gpu_info()

    # Determine Tier
    # Tier 4: Dedicated GPU >= 6GB or Apple Silicon M-series
    # Tier 3: Dedicated GPU < 6GB or Vulkan Discrete
    # Tier 2: Multi-core CPU (>= 8 cores) or Integrated GPU (Intel UHD/Iris / AMD Vega) with >= 16GB RAM
    # Tier 1: Dual/Quad-core CPU with <= 8GB RAM, no GPU
    if gpu_info["type"] == "dedicated" and gpu_info["vram_gb"] >= TIER_4_MIN_VRAM_GB:
        tier = 4
        tier_name = "Workstation IA (GPU Dedicada Alta)"
        tier_color = "emerald"
        recommendation = (
            "Seu computador possui GPU dedicada potente com aceleração acelerada. "
            "Todos os recursos de IA (CodeFormer, Real-ESRGAN e RIFE 60fps) funcionarão com alta velocidade."
        )
    elif gpu_info["type"] in ["dedicated", "apple_silicon"]:
        tier = 3
        tier_name = "PC Moderno (GPU Dedicada / Apple Silicon)"
        tier_color = "sky"
        recommendation = (
            "GPU com boa capacidade de aceleração detectada. RIFE e Real-ESRGAN funcionarão com fluidez "
            "satisfatória. CodeFormer viável para restaurações pontuais."
        )
    elif cpu_cores >= TIER_2_MIN_CPU_CORES or gpu_info["type"] == "integrated":
        tier = 2
        tier_name = "Multi-Core CPU + iGPU Vulkan"
        tier_color = "amber"
        recommendation = (
            f"Excelente CPU com {cpu_cores} núcleos lógicos e {ram_info['total_gb']}GB de RAM. "
            "Ideal para restauração com BWDIF/Lanczos (~60-120 fps), DeepFilterNet (áudio em tempo real) e Whisper. "
            "Aviso honesto: Modelos neurais pesados (CodeFormer / Real-ESRGAN) rodarão via CPU/iGPU a ~1-2 fps "
            "(cerca de 1h30min a 2h para uma fita de 1 hora). Recomendamos BWDIF para velocidade máxima."
        )
    else:
        tier = 1
        tier_name = "Básico (CPU Limitada)"
        tier_color = "slate"
        recommendation = (
            "Hardware modesto detectado. Recomendamos desentrelaçamento rápido (BWDIF) e filtros DSP clássicos. "
            "Evite ativar upscalers neurais para não sobrecarregar a máquina."
        )

    ai_capabilities = {
        "audio_deepfilter": {
            "name": "Restauração de Áudio Neural (DeepFilter)",
            "supported": True,
            "badge": "⚡ Tempo Real (CPU)",
            "cost": "low",
            "desc": "Remove chiado de fita magnética e zumbido elétrico sem distorcer vozes.",
        },
        "whisper": {
            "name": "Transcrição e Legendas (Faster-Whisper)",
            "supported": True,
            "badge": "⚡ Rápido no Tiny/Base",
            "cost": "low",
            "desc": "Geração offline de legendas sincronizadas por IA.",
        },
        "bwdif_deinterlace": {
            "name": "Desentrelaçamento BWDIF / Yadif",
            "supported": True,
            "badge": "⚡ Instantâneo (~120 fps)",
            "cost": "low",
            "desc": "Elimina serrilhado de campos entrelaçados sem perda de fluidez.",
        },
        "dropout_clean": {
            "name": "Eliminação de Dropouts de Fita",
            "supported": True,
            "badge": "🟡 Moderado (CPU)",
            "cost": "medium",
            "desc": "Remove linhas brancas de perda de óxido magnético através de análise temporal.",
        },
        "rife_60fps": {
            "name": "Interpolação de Movimento RIFE (60fps)",
            "supported": gpu_info["vulkan_available"],
            "badge": "🟡 Moderado (Vulkan)" if gpu_info["vulkan_available"] else "🔴 Lento na CPU",
            "cost": "medium",
            "desc": "Dobra a taxa de quadros para fluidez orgânica cinematográfica.",
        },
        "ai_face_restore": {
            "name": "Restauração Facial CodeFormer",
            "supported": True,
            "badge": "🔴 Intensivo (~1-2 fps)" if tier <= 2 else "🟡 Moderado",
            "cost": "high",
            "desc": "Reconstrói detalhes e feições de rostos distantes em filmagens de família.",
        },
        "ai_upscaler": {
            "name": "Super-Resolução Real-ESRGAN / Real-CUGAN",
            "supported": gpu_info["vulkan_available"] or tier >= 2,
            "badge": "🔴 Intensivo (~1-2 fps)" if tier <= 2 else "🟡 Moderado (GPU)",
            "cost": "high",
            "desc": "Upscale neural preservando texturas naturais.",
        },
    }

    return {
        "tier": tier,
        "tier_name": tier_name,
        "tier_color": tier_color,
        "recommendation": recommendation,
        "cpu": {
            "cores": cpu_cores,
            "arch": cpu_arch,
            "model": platform.processor() or "Processador x86_64",
        },
        "ram": ram_info,
        "gpu": gpu_info,
        "ai_capabilities": ai_capabilities,
    }
