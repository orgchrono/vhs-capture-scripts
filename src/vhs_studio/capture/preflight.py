import os
import shutil
import subprocess


def run_preflight_checks():
    issues = []

    # Check OBS Version via Caminho Absoluto
    obs_path = r"C:\Program Files\obs-studio\bin\64bit\obs64.exe"
    if not os.path.exists(obs_path):
        issues.append("OBS Studio não encontrado em C:\\Program Files\\obs-studio")

    # Check FFmpeg via subprocess
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        issues.append("FFmpeg não encontrado no PATH do sistema. Necessário para capítulos e processamento.")

    # Check Disk Space
    raw_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "media", "raw"))
    os.makedirs(raw_dir, exist_ok=True)
    total, used, free = shutil.disk_usage(raw_dir)
    free_gb = free / (1024**3)
    if free_gb < 50:
        issues.append(f"Espaço em disco insuficiente em media/raw: {free_gb:.1f}GB livre (Recomendado > 50GB)")

    return {
        "status": "pass" if len(issues) == 0 else "fail",
        "issues": issues,
        "disk_free_gb": free_gb,
    }
