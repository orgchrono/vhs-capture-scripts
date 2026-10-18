"""Hardware detection, system profiling, and honest AI performance capability tiering."""

import os
import platform
import shutil
import subprocess
from vhs_studio.core.system_process import run_silent
from typing import Dict, TypedDict
from vhs_studio.core.constants import TIER_4_MIN_VRAM_GB, TIER_2_MIN_CPU_CORES


class GpuInfo(TypedDict):
    """Semantic typed structure for detected GPU hardware."""
    type: str
    name: str
    vulkan_available: bool
    vram_gb: float


class RamInfo(TypedDict):
    """Semantic typed structure for RAM metrics."""
    total_gb: float
    available_gb: float


class CpuInfo(TypedDict):
    """Semantic typed structure for CPU metrics."""
    cores: int
    arch: str
    model: str


class AiCapability(TypedDict):
    """Semantic typed structure for AI capability status."""
    name: str
    supported: bool
    badge: str
    cost: str
    desc: str


class HardwareProfile(TypedDict):
    """Semantic typed structure for hardware capability tiering."""
    tier: int
    tier_name: str
    tier_key: str
    tier_color: str
    recommendation: str
    recommendation_key: str
    cpu: CpuInfo
    ram: RamInfo
    gpu: GpuInfo
    ai_capabilities: Dict[str, AiCapability]


def get_ram_info() -> RamInfo:
    """Retrieve system total and available RAM in Gigabytes without external dependencies."""
    total_gb = 8.0
    avail_gb = 4.0

    sys_name = platform.system()
    if sys_name == "Windows":
        try:
            import ctypes
            mem = (ctypes.c_ulonglong * 8)()
            mem[0] = 64
            windll = getattr(ctypes, "windll", None)
            if windll and windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem)):
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
            res = run_silent(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True)
            if res.returncode == 0:
                total_gb = round(float(res.stdout.strip()) / (1024 ** 3), 1)
                avail_gb = round(total_gb * 0.5, 1)
        except Exception:
            pass

    return {"total_gb": total_gb, "available_gb": avail_gb}


def detect_gpu_info() -> GpuInfo:
    """Inspect GPU hardware via Vulkan, NVIDIA-SMI, and system probes."""
    gpu_type = "cpu_only"
    gpu_name = "None (CPU Software Rendering)"
    vulkan_ok = False
    vram_gb = 0.0

    # 1. Check Vulkan
    if shutil.which("vulkaninfo"):
        try:
            res = run_silent(
                ["vulkaninfo", "--summary"],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=3,
            )
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
            res = run_silent(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                errors="replace",
                timeout=3,
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


def get_hardware_profile() -> HardwareProfile:
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
        tier_name = "AI Workstation (Dedicated High-End GPU)"
        tier_key = "hardware.tier_4"
        tier_color = "emerald"
        recommendation_key = "hardware.tier_4_rec"
        recommendation = (
            "High-performance dedicated GPU detected. "
            "All neural AI features (CodeFormer, Real-ESRGAN, and RIFE 60fps) will run at maximum speed."
        )
    elif gpu_info["type"] in ["dedicated", "apple_silicon"]:
        tier = 3
        tier_name = "Modern PC (Dedicated GPU / Apple Silicon)"
        tier_key = "hardware.tier_3"
        tier_color = "sky"
        recommendation_key = "hardware.tier_3_rec"
        recommendation = (
            "Accelerated GPU detected. RIFE and Real-ESRGAN will run smoothly. "
            "CodeFormer is viable for targeted restoration."
        )
    elif cpu_cores >= TIER_2_MIN_CPU_CORES or gpu_info["type"] == "integrated":
        tier = 2
        tier_name = "Multi-Core CPU + Vulkan iGPU"
        tier_key = "hardware.tier_2"
        tier_color = "amber"
        recommendation_key = "hardware.tier_2_rec"
        recommendation = (
            f"Multi-core CPU with {cpu_cores} cores and {ram_info['total_gb']}GB RAM. "
            "Ideal for BWDIF/Lanczos restoration (~60-120 fps), real-time DeepFilterNet, and Whisper. "
            "Honest notice: Heavy neural models (CodeFormer / Real-ESRGAN) will run via CPU/iGPU at ~1-2 fps."
        )
    else:
        tier = 1
        tier_name = "Basic (Limited CPU)"
        tier_key = "hardware.tier_1"
        tier_color = "slate"
        recommendation_key = "hardware.tier_1_rec"
        recommendation = (
            "Modest hardware detected. We recommend fast deinterlacing (BWDIF) and classic DSP filters. "
            "Avoid enabling heavy neural upscalers to prevent machine overload."
        )

    ai_capabilities: Dict[str, AiCapability] = {
        "audio_deepfilter": {
            "name": "Neural Audio Restoration (DeepFilterNet)",
            "supported": True,
            "badge": "⚡ Real-Time (CPU)",
            "cost": "low",
            "desc": "Eliminates analog tape hiss and electrical hum without vocal distortion.",
        },
        "whisper": {
            "name": "Transcription & Subtitles (Faster-Whisper)",
            "supported": True,
            "badge": "⚡ Fast on Tiny/Base",
            "cost": "low",
            "desc": "Offline AI-synchronized subtitle generation.",
        },
        "bwdif_deinterlace": {
            "name": "BWDIF / Yadif Deinterlacing",
            "supported": True,
            "badge": "⚡ Instant (~120 fps)",
            "cost": "low",
            "desc": "Eliminates interlaced comb artifacts without motion loss.",
        },
        "dropout_clean": {
            "name": "Tape Dropout Mitigation",
            "supported": True,
            "badge": "🟡 Moderate (CPU)",
            "cost": "medium",
            "desc": "Removes white oxide-loss dropouts via temporal analysis.",
        },
        "rife_60fps": {
            "name": "RIFE Motion Interpolation (60fps)",
            "supported": gpu_info["vulkan_available"],
            "badge": "🟡 Moderate (Vulkan)" if gpu_info["vulkan_available"] else "🔴 Slow on CPU",
            "cost": "medium",
            "desc": "Doubles frame rate for smooth cinematic motion.",
        },
        "ai_face_restore": {
            "name": "CodeFormer Face Restoration",
            "supported": True,
            "badge": "🔴 Intensive (~1-2 fps)" if tier <= 2 else "🟡 Moderate",
            "cost": "high",
            "desc": "Reconstructs facial details in distant VHS family footage.",
        },
        "ai_upscaler": {
            "name": "Real-ESRGAN / Real-CUGAN Super-Resolution",
            "supported": gpu_info["vulkan_available"] or tier >= 2,
            "badge": "🔴 Intensive (~1-2 fps)" if tier <= 2 else "🟡 Moderate (GPU)",
            "cost": "high",
            "desc": "Neural upscaler preserving natural video textures.",
        },
    }

    return {
        "tier": tier,
        "tier_name": tier_name,
        "tier_key": tier_key,
        "tier_color": tier_color,
        "recommendation": recommendation,
        "recommendation_key": recommendation_key,
        "cpu": {
            "cores": cpu_cores,
            "arch": cpu_arch,
            "model": platform.processor() or "x86_64 Processor",
        },
        "ram": ram_info,
        "gpu": gpu_info,
        "ai_capabilities": ai_capabilities,
    }
