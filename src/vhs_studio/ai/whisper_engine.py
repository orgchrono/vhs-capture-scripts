import os
import subprocess
from pathlib import Path

def extract_audio(video_path: str, output_wav: str) -> bool:
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        output_wav
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except subprocess.CalledProcessError:
        return False

def format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

def transcribe_and_generate_vtt(video_path: str, model_size: str = "tiny") -> str:
    """
    Extracts audio, transcribes with faster-whisper, and writes a .vtt sidecar.
    Returns the path to the VTT file.
    """
    from faster_whisper import WhisperModel
    
    base_dir = os.path.dirname(video_path)
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    temp_wav = os.path.join(base_dir, f"{base_name}_temp.wav")
    vtt_path = os.path.join(base_dir, f"{base_name}.vtt")

    print(f"[WHISPER] Extraindo audio temporario de {video_path}...")
    if not extract_audio(video_path, temp_wav):
        raise RuntimeError("Falha ao extrair audio via FFmpeg")

    device = "cpu"
    compute_type = "int8"
    
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16" # CUDA generally prefers float16
    except ImportError:
        pass
        
    print(f"[WHISPER] Carregando modelo {model_size} (Device: {device}, Compute: {compute_type})...")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    print(f"[WHISPER] Transcrevendo {temp_wav}...")
    segments, info = model.transcribe(temp_wav, beam_size=5)

    print(f"[WHISPER] Idioma detectado: {info.language} (probabilidade {info.language_probability:.2f})")

    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for segment in segments:
            start = format_timestamp(segment.start)
            end = format_timestamp(segment.end)
            f.write(f"{start} --> {end}\n")
            f.write(f"{segment.text.strip()}\n\n")

    # Cleanup temp
    if os.path.exists(temp_wav):
        os.remove(temp_wav)

    print(f"[WHISPER] Legenda salva em {vtt_path}")
    return vtt_path
