"""Unit tests for cross-platform package manager and system detection."""

import platform
from unittest.mock import patch
from vhs_studio.core.package_manager import (
    get_linux_distro_id,
    detect_package_manager,
    install_ffmpeg_crossplatform,
    install_obs_crossplatform,
    install_vapoursynth_crossplatform,
)


def test_get_linux_distro_id():
    """Verify Linux distro detection does not raise errors on any OS."""
    distro = get_linux_distro_id()
    assert isinstance(distro, str)


def test_detect_package_manager():
    """Verify package manager detection returns string or None without throwing."""
    mgr = detect_package_manager()
    assert mgr is None or isinstance(mgr, str)


def test_install_ffmpeg_linux_mocked():
    """Verify FFmpeg installation command dispatch on mocked Linux environments."""
    with patch("platform.system", return_value="Linux"), \
         patch("vhs_studio.core.package_manager.detect_package_manager", return_value="pacman"), \
         patch("vhs_studio.core.package_manager.run_system_install", return_value=True) as mock_install:
        res = install_ffmpeg_crossplatform()
        assert res is True
        mock_install.assert_called_with(["pacman", "-S", "--noconfirm", "ffmpeg"])


def test_install_ffmpeg_macos_mocked():
    """Verify FFmpeg installation command dispatch on mocked macOS environment."""
    with patch("platform.system", return_value="Darwin"), \
         patch("vhs_studio.core.package_manager.detect_package_manager", return_value="brew"), \
         patch("vhs_studio.core.package_manager.run_system_install", return_value=True) as mock_install:
        res = install_ffmpeg_crossplatform()
        assert res is True
        mock_install.assert_called_with(["brew", "install", "ffmpeg"])


def test_install_obs_linux_mocked():
    """Verify OBS installation command dispatch on mocked Linux DNF environment."""
    with patch("platform.system", return_value="Linux"), \
         patch("vhs_studio.core.package_manager.detect_package_manager", return_value="dnf"), \
         patch("vhs_studio.core.package_manager.run_system_install", return_value=True) as mock_install:
        res = install_obs_crossplatform()
        assert res is True
        mock_install.assert_called_with(["dnf", "install", "-y", "obs-studio"])


def test_install_vapoursynth_linux_mocked():
    """Verify VapourSynth installation on mocked Linux Arch environment."""
    with patch("platform.system", return_value="Linux"), \
         patch("vhs_studio.core.package_manager.detect_package_manager", return_value="pacman"), \
         patch("vhs_studio.core.package_manager.run_system_install", return_value=True) as mock_install:
        res = install_vapoursynth_crossplatform()
        assert res is True
        mock_install.assert_called_with(["pacman", "-S", "--noconfirm", "vapoursynth"])
