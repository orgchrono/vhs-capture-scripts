"""Module documentation pending."""

from vhs_studio.core.logger import log
import os
import subprocess


def extract_audio(video_path: str, output_wav: str) -> bool:
    """Extract single-channel 16kHz PCM audio for Whisper transcription with full CPU threads."""
    from vhs_studio.core.toolchain import Toolchain

    try:
        ffmpeg_path = Toolchain.get_ffmpeg_path()
    except (FileNotFoundError, Exception) as err:
        log.error(f"[WHISPER] FFmpeg não disponível para extração de áudio: {err}")
        return False

    cmd = [
        ffmpeg_path,
        "-hide_banner",
        "-threads",
        "0",
        "-y",
        "-i",
        video_path,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        output_wav,
    ]
    try:
        subprocess.run(
            cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        return True
    except subprocess.CalledProcessError:
        return False


def format_timestamp(seconds: float) -> str:
    """Documentation for format_timestamp."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def load_audio_wav(wav_path: str):
    """Load 16kHz mono PCM WAV into normalized float32 numpy array for Whisper."""
    import wave
    import numpy as np

    if not os.path.exists(wav_path):
        return np.zeros(16000, dtype=np.float32)

    with wave.open(wav_path, "rb") as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw_bytes = wf.readframes(n_frames)

    if sampwidth == 2:
        audio = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    elif sampwidth == 4:
        audio = np.frombuffer(raw_bytes, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif sampwidth == 1:
        audio = (np.frombuffer(raw_bytes, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        audio = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0

    if n_channels > 1:
        audio = audio.reshape(-1, n_channels).mean(axis=1)

    return audio


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

    log.info(f"[WHISPER] Extraindo audio temporario de {video_path}...")
    if not extract_audio(video_path, temp_wav):
        raise RuntimeError("Falha ao extrair audio via FFmpeg")

    device = "cpu"
    compute_type = "int8"

    try:
        import torch

        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"  # CUDA generally prefers float16
    except ImportError:
        pass

    total_cpus = os.cpu_count() or 4
    cpu_threads = max(2, min(8, total_cpus // 2 if total_cpus > 4 else total_cpus))
    num_workers = max(1, min(2, cpu_threads // 2))
    log.info(
        f"[WHISPER] Carregando modelo {model_size} "
        f"(Device: {device}, Compute: {compute_type}, Threads: {cpu_threads})..."
    )
    model = WhisperModel(
        model_size,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=num_workers,
    )

    log.info("[WHISPER] Carregando waveform de áudio para transcrição...")
    audio_data = load_audio_wav(temp_wav)
    duration_sec = len(audio_data) / 16000.0 if len(audio_data) > 0 else 0.0
    log.info(f"[WHISPER] Transcrevendo {temp_wav} ({duration_sec:.1f}s)...")
    segments, info = model.transcribe(audio_data, beam_size=5)

    log.info(
        f"[WHISPER] Idioma detectado: {info.language} (probabilidade {info.language_probability:.2f})"
    )

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

    log.info(f"[WHISPER] Legenda salva em {vtt_path}")
    return vtt_path
