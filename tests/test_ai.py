import sys
import pytest
from unittest.mock import patch, MagicMock

# Ensure faster_whisper module is present in sys.modules for mock patching
if "faster_whisper" not in sys.modules:
    mock_module = MagicMock()
    mock_module.__path__ = []
    sys.modules["faster_whisper"] = mock_module
if "faster_whisper.vad" not in sys.modules:
    mock_vad = MagicMock()
    sys.modules["faster_whisper.vad"] = mock_vad
    sys.modules["faster_whisper"].vad = mock_vad

from vhs_studio.ai.whisper_engine import (
    extract_audio,
    format_timestamp,
    transcribe_and_generate_vtt,
    load_audio_wav,
    detect_first_speech_and_language,
)


def test_format_timestamp():
    assert format_timestamp(0) == "00:00:00.000"
    assert format_timestamp(3661.123) == "01:01:01.123"
    assert format_timestamp(59.999) == "00:00:59.999"


def test_load_audio_wav_missing_file():
    arr = load_audio_wav("non_existent_file.wav")
    assert len(arr) == 16000
    assert arr.dtype.name == "float32"


def test_load_audio_wav_valid(tmp_path):
    import wave
    import numpy as np

    wav_file = tmp_path / "test.wav"
    samples = np.array([0, 16384, -16384, 0], dtype=np.int16)
    with wave.open(str(wav_file), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(samples.tobytes())

    arr = load_audio_wav(str(wav_file))
    assert len(arr) == 4
    assert arr[1] == pytest.approx(0.5, abs=0.01)
    assert arr[2] == pytest.approx(-0.5, abs=0.01)


@patch("vhs_studio.core.toolchain.Toolchain.get_ffmpeg_path", return_value="ffmpeg")
@patch("subprocess.run")
def test_extract_audio_success(mock_run, mock_ffmpeg):
    mock_run.return_value = MagicMock(returncode=0)
    assert extract_audio("dummy.mkv", "out.wav") is True
    mock_run.assert_called_once()


@patch("vhs_studio.core.toolchain.Toolchain.get_ffmpeg_path", return_value="ffmpeg")
@patch("subprocess.run")
def test_extract_audio_failure(mock_run, mock_ffmpeg):
    import subprocess

    mock_run.side_effect = subprocess.CalledProcessError(1, "cmd")
    assert extract_audio("dummy.mkv", "out.wav") is False


def test_extract_audio_missing_ffmpeg():
    with patch(
        "vhs_studio.core.toolchain.Toolchain.get_ffmpeg_path",
        side_effect=FileNotFoundError("not found"),
    ):
        assert extract_audio("dummy.mkv", "out.wav") is False


@patch("vhs_studio.ai.whisper_engine.extract_audio")
@patch("faster_whisper.WhisperModel")
def test_transcribe_and_generate_vtt(mock_model_cls, mock_extract, tmp_path):
    mock_extract.return_value = True
    mock_model = MagicMock()
    mock_model_cls.return_value = mock_model

    segment1 = MagicMock()
    segment1.start = 0.0
    segment1.end = 2.5
    segment1.text = "Hello world"
    mock_model.transcribe.return_value = (
        [segment1],
        MagicMock(language="pt", language_probability=0.99),
    )

    video_path = tmp_path / "video.mkv"
    video_path.write_text("dummy")

    vtt_path = transcribe_and_generate_vtt(str(video_path), language="pt")

    assert vtt_path == str(tmp_path / "video.vtt")
    mock_model.transcribe.assert_called_once()
    assert mock_model.transcribe.call_args[1].get("language") == "pt"
    with open(vtt_path, "r", encoding="utf-8") as f:
        content = f.read()
        assert "WEBVTT" in content
        assert "00:00:00.000 --> 00:00:02.500" in content
        assert "Hello world" in content


@patch("vhs_studio.ai.whisper_engine.extract_audio")
@patch("faster_whisper.WhisperModel")
def test_transcribe_cleans_up_temp_wav_on_error(mock_model_cls, mock_extract, tmp_path):
    temp_wav = tmp_path / "video_temp.wav"

    def fake_extract(video_p, wav_p):
        temp_wav.write_bytes(b"RIFF0000WAVE")
        return True

    mock_extract.side_effect = fake_extract
    mock_model = MagicMock()
    mock_model.transcribe.side_effect = RuntimeError("Simulated Whisper OOM")
    mock_model_cls.return_value = mock_model

    video_path = tmp_path / "video.mkv"
    video_path.write_text("dummy")

    with patch("vhs_studio.ai.whisper_engine.load_audio_wav", return_value=[0.0] * 1600):
        with pytest.raises(RuntimeError, match="Simulated Whisper OOM"):
            transcribe_and_generate_vtt(str(video_path))

    assert not temp_wav.exists()


@patch("vhs_studio.ai.whisper_engine.extract_audio")
@patch("faster_whisper.WhisperModel")
def test_detect_first_speech_and_language(mock_model_cls, mock_extract, tmp_path):
    mock_extract.return_value = True
    mock_model = MagicMock()
    mock_model_cls.return_value = mock_model
    mock_model.detect_language.return_value = ("pt", 0.96, [("pt", 0.96), ("es", 0.03)])

    video_path = tmp_path / "video.mkv"
    video_path.write_text("dummy")

    with patch("vhs_studio.ai.whisper_engine.load_audio_wav", return_value=[0.1] * 16000 * 5):
        with patch("faster_whisper.vad.get_speech_timestamps", return_value=[{"start": 32000, "end": 48000}]):
            res = detect_first_speech_and_language(str(video_path))

    assert res["has_speech"] is True
    assert res["first_speech_time"] == 2.0
    assert res["detected_language"] == "pt"
    assert res["probability"] == 0.96
    assert res["is_ambiguous"] is False
    assert len(res["candidates"]) == 2
