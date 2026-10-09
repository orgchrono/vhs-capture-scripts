import pytest
from unittest.mock import patch, MagicMock
from vhs_studio.video.chapter_marker import (
    parse_scenedetect_csv,
    generate_ffmetadata_text,
    generate_chapters,
)


def test_parse_scenedetect_csv_empty():
    assert parse_scenedetect_csv("") == []
    assert parse_scenedetect_csv("Invalid header") == []


def test_parse_scenedetect_csv_valid():
    sample_csv = """Timecode List:
Scene Number,Frame Number (Start),Timecode (Start),Seconds (Start),Frame Number (End),Timecode (End),Seconds (End)
1,0,00:00:00.000,0.000,30,00:00:01.000,1.000
2,31,00:00:01.033,1.033,60,00:00:02.000,2.000
"""
    scenes = parse_scenedetect_csv(sample_csv)
    assert len(scenes) == 2
    assert scenes[0] == (0, 1000)
    assert scenes[1] == (1033, 2000)


def test_generate_ffmetadata_text():
    scenes = [(0, 1000), (1033, 2000)]
    metadata = generate_ffmetadata_text("Minha Fita", scenes)
    assert ";FFMETADATA1" in metadata
    assert "title=Minha Fita" in metadata
    assert "[CHAPTER]" in metadata
    assert "START=0" in metadata
    assert "END=1000" in metadata
    assert "title=Cena 1" in metadata
    assert "title=Cena 2" in metadata


@patch("vhs_studio.video.chapter_marker._run_ffmpeg_mux")
@patch("vhs_studio.video.chapter_marker._run_scenedetect")
def test_generate_chapters_success(mock_detect, mock_mux, tmp_path):
    mock_detect.return_value = True
    mock_mux.return_value = True

    video_in = str(tmp_path / "tape.mkv")
    video_out = str(tmp_path / "tape_chapters.mkv")

    # Create dummy csv that _run_scenedetect would have created
    csv_file = tmp_path / "tape-Scenes.csv"
    csv_file.write_text(
        "Scene Number,Frame,Timecode,Seconds (Start),Frame,Timecode,Seconds (End)\n1,0,00:00:00,0.0,30,00:00:01,1.0\n"
    )

    success = generate_chapters(video_in, video_out)
    assert success is True
    mock_mux.assert_called_once()
