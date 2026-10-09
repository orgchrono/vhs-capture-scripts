"""Unit tests for fast dependency checking and hashing cache."""

import os
from unittest.mock import patch
from scripts.fast_deps import compute_file_hash, check_python_deps, check_ui_deps


def test_compute_file_hash(tmp_path):
    """Verify SHA-256 calculation on test file."""
    f = tmp_path / "test.txt"
    f.write_text("hello vhs")
    h = compute_file_hash(str(f))
    assert len(h) == 64
    assert isinstance(h, str)


def test_compute_file_hash_nonexistent():
    """Verify compute_file_hash returns empty string for missing file."""
    h = compute_file_hash("nonexistent_file_xyz_123.txt")
    assert h == ""


def test_check_python_deps_hit(tmp_path):
    """Verify cache hit when pyproject.toml matches stored hash."""
    fake_hash = "abc12345"
    with patch("scripts.fast_deps.compute_file_hash", return_value=fake_hash), \
         patch("os.path.exists", return_value=True), \
         patch("builtins.open", create=True) as mock_open:
        mock_open.return_value.__enter__.return_value.read.return_value = fake_hash
        ok, h = check_python_deps()
        assert ok is True
        assert h == fake_hash


def test_check_python_deps_miss():
    """Verify cache miss when hashes do not match."""
    with patch("scripts.fast_deps.compute_file_hash", return_value="hash_new"), \
         patch("os.path.exists", return_value=False):
        ok, h = check_python_deps()
        assert ok is False
        assert h == "hash_new"
