"""Tests for smart cross-platform video thumbnail generator and media endpoints."""

import os
import tempfile
import cv2  # type: ignore
import numpy as np  # type: ignore
import pytest
from fastapi.testclient import TestClient

from vhs_studio.api.server import app
from vhs_studio.media.thumbnail import (
    generate_smart_thumbnail,
    get_thumbnail_path_for_video,
    _evaluate_frame_candidate,
)


def test_get_thumbnail_path_deterministic():
    """Verify get_thumbnail_path_for_video produces consistent hashed paths."""
    p1 = get_thumbnail_path_for_video("C:/media/raw/test1.mkv")
    p2 = get_thumbnail_path_for_video("C:/media/raw/test1.mkv")
    assert p1 == p2
    assert p1.endswith(".jpg")


def test_generate_smart_thumbnail_nonexistent():
    """Verify non-existent file returns None safely without raising exceptions."""
    res = generate_smart_thumbnail("does_not_exist_file.mkv")
    assert res is None


def test_evaluate_frame_candidate_scoring():
    """Verify luminance rejection and sharpness scoring for candidates."""
    # 1. Pure black frame (should be rejected)
    black_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    score, has_face = _evaluate_frame_candidate(black_frame, None)
    assert score == -1000.0
    assert not has_face

    # 2. Pure white frame (should be rejected)
    white_frame = np.full((480, 640, 3), 255, dtype=np.uint8)
    score_w, _ = _evaluate_frame_candidate(white_frame, None)
    assert score_w == -1000.0

    # 3. High-contrast structured frame (should receive positive score)
    structured_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Add checkerboard pattern for high sharpness
    structured_frame[::20, :, :] = 200
    structured_frame[:, ::20, :] = 200
    score_s, _ = _evaluate_frame_candidate(structured_frame, None)
    assert score_s > 0.0


def test_generate_smart_thumbnail_with_synthetic_video():
    """Verify end-to-end thumbnail generation starting at frame 0 and caching."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "test_clip.avi")

        # Create a small synthetic video with OpenCV
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        out = cv2.VideoWriter(video_path, fourcc, 10.0, (320, 240))
        for i in range(15):
            frame = np.zeros((240, 320, 3), dtype=np.uint8)
            # Frame 0 has black leader, frame 5 has image
            if i >= 5:
                cv2.putText(
                    frame,
                    f"Frame {i}",
                    (50, 120),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    (255, 255, 255),
                    2,
                )
            out.write(frame)
        out.release()

        thumb_out = os.path.join(tmp_dir, "thumb.jpg")
        result = generate_smart_thumbnail(video_path, output_path=thumb_out)

        assert result is not None
        assert os.path.exists(thumb_out)
        assert os.path.getsize(thumb_out) > 500

        # Verify caching returns existing file directly
        cached_result = generate_smart_thumbnail(video_path, output_path=thumb_out)
        assert cached_result == thumb_out


def test_api_thumbnail_endpoint():
    """Verify /api/media/thumbnail endpoint returns 404 for invalid path and serves valid images."""
    client = TestClient(app)

    # 1. Unsafe path should return 404
    res = client.get("/api/media/thumbnail?path=../../etc/passwd")
    assert res.status_code == 404

    # 2. Valid video thumbnail request
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = os.path.join(tmp_dir, "sample.avi")
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        out = cv2.VideoWriter(video_path, fourcc, 10.0, (160, 120))
        for _ in range(5):
            frame = np.full((120, 160, 3), 128, dtype=np.uint8)
            out.write(frame)
        out.release()

        res_thumb = client.get(f"/api/media/thumbnail?path={video_path}")
        assert res_thumb.status_code == 200
        assert res_thumb.headers["content-type"] == "image/jpeg"
