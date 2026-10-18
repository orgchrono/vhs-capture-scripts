from typing import Optional
from vhs_studio.core.logger import log
import os
from vhs_studio.core.system_process import run_silent


def extract_audio(video_path: str, output_wav: str) -> bool:
    """Extract single-channel 16kHz PCM audio for Whisper transcription with full CPU threads."""
    from vhs_studio.core.toolchain import Toolchain

    try:
        ffmpeg_path = Toolchain.get_ffmpeg_path()
    except (FileNotFoundError, Exception) as err:
        log.error(f"[WHISPER] FFmpeg not available for audio extraction: {err}")
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
        run_silent(
            cmd, check=True, stdout=None, stderr=None
        )
        return True
    except Exception:
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


def detect_first_speech_and_language(
    video_path: str,
    model_size: str = "tiny",
) -> dict:
    """
    Extracts temporary audio, runs Silero VAD to identify first human speech,
    and runs language detection on the active speech segment.
    """
    from faster_whisper import WhisperModel

    base_dir = os.path.dirname(video_path)
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    temp_wav = os.path.join(base_dir, f"{base_name}_speech_probe.wav")

    try:
        log.info(f"[WHISPER] Probing first speech activity on {video_path}...")
        if not extract_audio(video_path, temp_wav):
            return {
                "has_speech": False,
                "first_speech_time": 0.0,
                "detected_language": "pt",
                "probability": 0.0,
                "is_ambiguous": True,
                "candidates": [{"language": "pt", "probability": 1.0}],
            }

        audio_data = load_audio_wav(temp_wav)
        if len(audio_data) == 0:
            return {
                "has_speech": False,
                "first_speech_time": 0.0,
                "detected_language": "pt",
                "probability": 0.0,
                "is_ambiguous": True,
                "candidates": [{"language": "pt", "probability": 1.0}],
            }

        speech_timestamps = []
        try:
            from faster_whisper.vad import get_speech_timestamps
            speech_timestamps = get_speech_timestamps(audio_data, sampling_rate=16000)
        except Exception as vad_err:
            log.debug(f"[WHISPER] Silero VAD probe failed: {vad_err}")

        has_speech = len(speech_timestamps) > 0
        first_speech_time = 0.0

        if has_speech:
            first_speech_sample = speech_timestamps[0]["start"]
            first_speech_time = float(first_speech_sample) / 16000.0
            sample_start = max(0, first_speech_sample - 8000)
            sample_end = min(len(audio_data), sample_start + 16000 * 30)
            probe_audio = audio_data[sample_start:sample_end]
            log.info(f"[WHISPER] First speech segment detected at {first_speech_time:.2f}s.")
        else:
            log.info("[WHISPER] No prominent speech found in initial VAD scan. Probing first 30s.")
            probe_audio = audio_data[: min(len(audio_data), 16000 * 30)]

        device = "cpu"
        compute_type = "int8"
        try:
            import torch

            if torch.cuda.is_available():
                device = "cuda"
                compute_type = "float16"
        except ImportError:
            pass

        total_cpus = os.cpu_count() or 4
        cpu_threads = max(2, min(4, total_cpus))
        model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=cpu_threads,
            num_workers=1,
        )

        detected_lang, prob, all_probs = model.detect_language(probe_audio, vad_filter=True)
        is_ambiguous = (not has_speech) or (float(prob) < 0.75)

        candidates = [
            {"language": str(lang), "probability": round(float(p), 3)}
            for lang, p in (all_probs[:8] if all_probs else [])
        ]

        final_lang = str(detected_lang)
        if is_ambiguous and float(prob) < 0.60:
            final_lang = "pt"

        return {
            "has_speech": has_speech,
            "first_speech_time": round(first_speech_time, 2),
            "detected_language": final_lang,
            "probability": round(float(prob), 3),
            "is_ambiguous": is_ambiguous,
            "candidates": candidates,
        }
    except Exception as exc:
        log.warning(f"[WHISPER] First speech language probe failed: {exc}")
        return {
            "has_speech": False,
            "first_speech_time": 0.0,
            "detected_language": "pt",
            "probability": 0.0,
            "is_ambiguous": True,
            "candidates": [{"language": "pt", "probability": 1.0}],
        }
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except OSError:
                pass


def transcribe_and_generate_vtt(
    video_path: str,
    model_size: str = "tiny",
    language: Optional[str] = "pt",
) -> str:
    """
    Extracts audio, transcribes with faster-whisper, and writes a .vtt sidecar.
    Returns the path to the VTT file.
    """
    from faster_whisper import WhisperModel

    base_dir = os.path.dirname(video_path)
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    temp_wav = os.path.join(base_dir, f"{base_name}_temp.wav")
    vtt_path = os.path.join(base_dir, f"{base_name}.vtt")

    try:
        log.info(f"[WHISPER] Extracting temporary audio from {video_path}...")
        if not extract_audio(video_path, temp_wav):
            raise RuntimeError("Failed to extract audio via FFmpeg")

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
            f"[WHISPER] Loading model {model_size} "
            f"(Device: {device}, Compute: {compute_type}, Threads: {cpu_threads})..."
        )
        model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=cpu_threads,
            num_workers=num_workers,
        )

        log.info("[WHISPER] Loading audio waveform for transcription...")
        audio_data = load_audio_wav(temp_wav)
        duration_sec = len(audio_data) / 16000.0 if len(audio_data) > 0 else 0.0
        log.info(f"[WHISPER] Transcribing {temp_wav} ({duration_sec:.1f}s)...")

        # Detect first speech segment with Silero VAD
        speech_timestamps = []
        try:
            from faster_whisper.vad import get_speech_timestamps
            speech_timestamps = get_speech_timestamps(audio_data, sampling_rate=16000)
        except Exception as vad_err:
            log.debug(f"[WHISPER] Silero VAD failed: {vad_err}")

        if speech_timestamps:
            first_speech_time = float(speech_timestamps[0]["start"]) / 16000.0
            log.info(f"[WHISPER] First speech activity detected at {first_speech_time:.2f}s.")
        else:
            log.info("[WHISPER] No isolated speech detected via VAD pre-scan.")

        lang_param = None
        if language and language.strip().lower() != "auto":
            lang_param = language.strip().lower()

        if lang_param:
            log.info(f"[WHISPER] Target language forced: {lang_param}")
            segments, info = model.transcribe(
                audio_data,
                beam_size=5,
                language=lang_param,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500, threshold=0.5),
            )
        else:
            log.info("[WHISPER] Detecting language automatically with speech focus...")
            probe_slice = audio_data
            if speech_timestamps:
                p_start = speech_timestamps[0]["start"]
                p_end = min(len(audio_data), p_start + 16000 * 30)
                probe_slice = audio_data[p_start:p_end]

            try:
                det_lang, det_prob, _ = model.detect_language(probe_slice, vad_filter=True)
                if det_prob < 0.70:
                    log.warning(
                        f"[WHISPER] Ambiguous detection ({det_lang}: {det_prob:.2f}). Defaulting to 'pt' to prevent tape noise hallucination."
                    )
                    lang_param = "pt"
                else:
                    lang_param = det_lang
                    log.info(f"[WHISPER] High confidence detection: {det_lang} ({det_prob:.2f})")
            except Exception as e:
                log.warning(f"[WHISPER] Auto detection failed ({e}). Defaulting to 'pt'.")
                lang_param = "pt"

            segments, info = model.transcribe(
                audio_data,
                beam_size=5,
                language=lang_param,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500, threshold=0.5),
            )

        log.info(
            f"[WHISPER] Active language: {info.language} (probability {info.language_probability:.2f})"
        )

        with open(vtt_path, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n")
            for segment in segments:
                start = format_timestamp(segment.start)
                end = format_timestamp(segment.end)
                f.write(f"{start} --> {end}\n")
                f.write(f"{segment.text.strip()}\n\n")

        log.info(f"[WHISPER] Subtitles saved to {vtt_path}")
        return vtt_path
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except OSError as exc:
                log.warning(f"[WHISPER] Failed to remove temporary WAV ({temp_wav}): {exc}")
