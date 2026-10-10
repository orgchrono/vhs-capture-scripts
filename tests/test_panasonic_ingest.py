"""Tests for Panasonic DVR ingestion, MEIHDFS filesystem inspection, and stream carving."""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from vhs_studio.api.server import app
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.ingest.panasonic_dvr import (
    inspect_panasonic_source,
    extract_panasonic_media,
    SIG_MEIHDFS_V2,
    SIG_MEIHDFS_V1,
    SIG_DVD_VR_MANGR,
    MPEG2_PACK_HEADER,
)


def test_toolchain_panasonic_extractor_methods():
    """Verify Toolchain provides Panasonic extractor discovery methods."""
    path = Toolchain.get_panasonic_extractor_path()
    assert path is None or isinstance(path, str)
    is_avail = Toolchain.is_panasonic_extractor_available()
    assert isinstance(is_avail, bool)


def test_inspect_nonexistent_file():
    """Verify non-existent paths return NOT_FOUND without throwing exceptions."""
    res = inspect_panasonic_source("nonexistent_disk_image.img")
    assert not res.is_panasonic
    assert res.format == "NOT_FOUND"
    assert not res.can_extract


def test_inspect_meihdfs_v2():
    """Verify detection of Panasonic MEIHDFS-V2.0 superblock signature."""
    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as f:
        # Write dummy sector padding followed by MEIHDFS-V2.0 magic
        f.write(b"\x00" * 512)
        f.write(SIG_MEIHDFS_V2)
        f.write(b"\x00" * 2048)
        f_path = f.name

    try:
        res = inspect_panasonic_source(f_path)
        assert res.is_panasonic
        assert res.format == "MEIHDFS-V2.0"
        assert res.can_extract
        assert 512 in res.detected_offsets
    finally:
        if os.path.exists(f_path):
            os.remove(f_path)


def test_inspect_meihdfs_v1():
    """Verify detection of legacy Panasonic MEIHDFS-V1.0 DMR-E filesystem."""
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as f:
        f.write(SIG_MEIHDFS_V1)
        f.write(b"\x00" * 1024)
        f_path = f.name

    try:
        res = inspect_panasonic_source(f_path)
        assert res.is_panasonic
        assert res.format == "MEIHDFS-V1.0"
        assert res.can_extract
    finally:
        if os.path.exists(f_path):
            os.remove(f_path)


def test_inspect_dvd_vr():
    """Verify detection of Panasonic DVD-VR volume structure."""
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(b"\x00" * 1024)
        f.write(SIG_DVD_VR_MANGR)
        f.write(b"\x00" * 1024)
        f_path = f.name

    try:
        res = inspect_panasonic_source(f_path)
        assert res.is_panasonic
        assert res.format == "DVD-VR"
        assert res.can_extract
    finally:
        if os.path.exists(f_path):
            os.remove(f_path)


def test_inspect_mpeg2_ps_stream():
    """Verify detection of MPEG-2 Program Stream packets in raw dump."""
    with tempfile.NamedTemporaryFile(suffix=".vro", delete=False) as f:
        # Write repeated pack headers
        for _ in range(10):
            f.write(MPEG2_PACK_HEADER + b"\x00" * 2044)
        f_path = f.name

    try:
        res = inspect_panasonic_source(f_path)
        assert res.is_panasonic
        assert res.format == "MPEG2-PS-STREAM"
        assert res.can_extract
    finally:
        if os.path.exists(f_path):
            os.remove(f_path)


def test_inspect_unknown_data():
    """Verify random non-Panasonic data returns UNKNOWN."""
    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as f:
        f.write(b"RANDOM_GENERIC_DATA_NON_PANASONIC" * 50)
        f_path = f.name

    try:
        res = inspect_panasonic_source(f_path)
        assert not res.is_panasonic
        assert res.format == "UNKNOWN"
        assert not res.can_extract
    finally:
        if os.path.exists(f_path):
            os.remove(f_path)


def test_native_panasonic_extraction_toolchain():
    """Verify native toolchain extraction execution and missing binary handling."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        src_path = os.path.join(tmp_dir, "test_raw_disk.img")
        out_dir = os.path.join(tmp_dir, "output")

        with open(src_path, "wb") as f:
            f.write(SIG_MEIHDFS_V2 + b"\x00" * 4096)

        # When toolchain binary is absent, returns empty list without carving
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(Toolchain, "get_panasonic_extractor_path", lambda: None)
            res = extract_panasonic_media(src_path, output_dir=out_dir)
            assert res == []

        # When toolchain binary is present, runs extraction
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(Toolchain, "get_panasonic_extractor_path", lambda: "fake_extractor")
            mp.setattr("subprocess.run", lambda *args, **kwargs: type("Obj", (), {"returncode": 0, "stdout": "", "stderr": ""})())
            # Create a mock output media file in destination
            mock_video = os.path.join(out_dir, "title_01.mpg")
            with open(mock_video, "w") as f:
                f.write("mock media")
            res = extract_panasonic_media(src_path, output_dir=out_dir)
            assert len(res) == 1
            assert res[0] == mock_video


def test_api_panasonic_endpoints():
    """Verify FastAPI endpoints for Panasonic inspection and extraction."""
    client = TestClient(app)

    # 1. Unsafe path should return 400
    res_unsafe = client.get("/api/ingest/panasonic/inspect?source_path=../../etc/shadow")
    assert res_unsafe.status_code == 400

    # 2. Inspect valid safe image
    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as f:
        f.write(SIG_MEIHDFS_V2)
        f.write(b"\x00" * 2048)
        img_path = f.name

    try:
        res = client.get(f"/api/ingest/panasonic/inspect?source_path={img_path}")
        assert res.status_code == 200
        data = res.json()
        assert data["is_panasonic"] is True
        assert data["format"] == "MEIHDFS-V2.0"

        # 3. Extract via API
        with tempfile.TemporaryDirectory() as out_dir:
            payload = {"source_path": img_path, "output_dir": out_dir}
            res_ext = client.post("/api/ingest/panasonic/extract", json=payload)
            assert res_ext.status_code == 200
            assert res_ext.json()["status"] == "success"
    finally:
        if os.path.exists(img_path):
            os.remove(img_path)


def test_toolchain_extended_panasonic_binaries():
    """Verify Toolchain provides dvd-vr and udf_dump discovery methods."""
    dvd_vr = Toolchain.get_dvd_vr_path()
    assert dvd_vr is None or isinstance(dvd_vr, str)
    assert isinstance(Toolchain.is_dvd_vr_available(), bool)

    udf_dump = Toolchain.get_udf_dump_path()
    assert udf_dump is None or isinstance(udf_dump, str)
    assert isinstance(Toolchain.is_udf_dump_available(), bool)


def test_inspect_panasonic_firmware_service_image():
    """Verify inspection correctly classifies 100MB HDD firmware/bootloader replacement image."""
    firmware_path = os.path.join("bin", "panasonic DMR EH-55 Firmware hdd_100.bin")
    if os.path.exists(firmware_path):
        res = inspect_panasonic_source(firmware_path)
        assert res.is_panasonic is True
        assert res.format == "PANASONIC_FIRMWARE_SERVICE_IMAGE"
        assert res.can_extract is False
        assert "Service Bootloader" in res.details
    else:
        # Create a mock 100MB dummy firmware file with name matching pattern
        with tempfile.NamedTemporaryFile(prefix="panasonic_dmr_firmware_hdd_100", suffix=".bin", delete=False) as f:
            f.write(b"\x00" * 4096)
            tmp_path = f.name
        try:
            res = inspect_panasonic_source(tmp_path)
            assert res.is_panasonic is True
            assert res.format == "PANASONIC_FIRMWARE_SERVICE_IMAGE"
            assert res.can_extract is False
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
