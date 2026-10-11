"""Tests for cryptographic fixity and SHA-256 integrity verification of Panasonic tools."""

import os
import json
import tempfile
import pytest
from unittest.mock import patch

from vhs_studio.core.toolchain import Toolchain
from vhs_studio.core.paths import PANASONIC_TOOLS_DIR
from scripts.build_panasonic_tools import compute_sha256, verify_precompiled_binaries


def test_manifest_file_exists_and_is_valid_json():
    """Verify that checksums.json exists and contains required manifest structures."""
    manifest_path = os.path.join(PANASONIC_TOOLS_DIR, "checksums.json")
    assert os.path.exists(manifest_path), "checksums.json manifest must exist in tools/panasonic_rec"

    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert "version" in data
    assert "binaries" in data
    assert "windows-x64" in data["binaries"]
    win_bins = data["binaries"]["windows-x64"]
    for expected_bin in ["extract_meihdfs.exe", "dvd-vr.exe", "udf_dump.exe"]:
        assert expected_bin in win_bins
        assert "sha256" in win_bins[expected_bin]
        assert len(win_bins[expected_bin]["sha256"]) == 64


def test_build_panasonic_tools_verify_function():
    """Verify that build_panasonic_tools verify_precompiled_binaries passes on clean repo."""
    assert verify_precompiled_binaries() is True


def test_toolchain_verify_binary_integrity():
    """Verify Toolchain detects authentic binaries and verifies their hashes."""
    for bin_name in ["extract_meihdfs", "dvd-vr", "udf_dump"]:
        path = Toolchain.get_panasonic_extractor_path(bin_name)
        if path and os.path.exists(path):
            is_valid, msg = Toolchain.verify_panasonic_binary_integrity(bin_name)
            assert is_valid is True, f"Failed verifying {bin_name}: {msg}"
            assert "Verified SHA-256" in msg or "locally compiled" in msg


def test_toolchain_detects_corrupted_or_tampered_binary():
    """Verify that a binary with an invalid hash is rejected with INTEGRITY MISMATCH."""
    with tempfile.NamedTemporaryFile(suffix=".exe", delete=False) as dummy:
        dummy.write(b"CORRUPTED_OR_MALICIOUS_BINARY_BYTES_1234567890")
        dummy_path = dummy.name

    try:
        # Mock get_panasonic_executable_path to return our dummy file
        with patch("vhs_studio.core.toolchain.get_panasonic_executable_path", return_value=dummy_path):
            with patch("platform.system", return_value="Windows"):
                with patch("os.path.basename", return_value="extract_meihdfs.exe"):
                    is_valid, msg = Toolchain.verify_panasonic_binary_integrity("extract_meihdfs")
                    assert is_valid is False
                    assert "INTEGRITY MISMATCH" in msg

                # Also verify require_verified_panasonic_extractor raises PermissionError
                with patch("os.path.basename", return_value="extract_meihdfs.exe"):
                    with pytest.raises(PermissionError) as exc_info:
                        Toolchain.require_verified_panasonic_extractor("extract_meihdfs")
                    assert "Security validation failed" in str(exc_info.value)
    finally:
        if os.path.exists(dummy_path):
            os.remove(dummy_path)


def test_compute_sha256_matches_hashlib():
    """Verify compute_sha256 calculates expected standard hash."""
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"test-stream-for-fixity")
        f_path = f.name

    try:
        calc_sha = compute_sha256(f_path)
        # sha256 of "test-stream-for-fixity"
        # echo -n "test-stream-for-fixity" | sha256sum
        import hashlib
        expected = hashlib.sha256(b"test-stream-for-fixity").hexdigest()
        assert calc_sha == expected
    finally:
        if os.path.exists(f_path):
            os.remove(f_path)
