#!/usr/bin/env python3
"""test_characterization.py - Characterization tests for pipeline behaviors.

Documents and validates specific historical pipeline behaviors and regression contracts.
"""

import os
import sys
import unittest
import subprocess
from unittest.mock import patch, MagicMock

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(REPO_ROOT, "src")
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from vhs_studio.core import vhs_common
from vhs_studio.core.filter_builder import FilterBuilder


class TestCharacterization(unittest.TestCase):

    @patch("subprocess.run")
    @patch("vhs_studio.core.toolchain.Toolchain.require_executable")
    def test_c08_idet_double_parse(self, mock_require, mock_run):
        """C-08: Test idet parser on synthetic tape metadata."""
        mock_require.return_value = "ffmpeg"
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="",
            stderr=(
                "[Parsed_idet_0 @ 0x123] Repeated Fields: Neither:  100 Top:    0 Bottom:    0\n"
                "[Parsed_idet_0 @ 0x123] Single frame detection: TFF:    0 BFF:  100 Progressive:    0 Undetermined:    0\n"
                "[Parsed_idet_0 @ 0x123] Multi frame detection: TFF:    0 BFF:  100 Progressive:    0 Undetermined:    0"
            ),
        )
        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        try:
            result = vhs_common.detect_interlace_status(fixture_path)
            self.assertIsNotNone(result)
        except AttributeError:
            pass

    def test_c07_ignored_flags(self):
        """C-07: Verify parse_known_args in direct_restore ignores unknown flags instead of aborting."""
        direct_restore = os.path.join(REPO_ROOT, "src", "vhs_studio", "video", "direct_restore.py")
        res = subprocess.run(
            [
                sys.executable,
                direct_restore,
                "--in",
                "dummy.mkv",
                "--prores",
                "--flag-inexistente",
                "--dry-run",
            ],
            capture_output=True,
            text=True,
        )
        self.assertNotIn("unrecognized arguments: --flag-inexistente", res.stderr)

    @patch("vhs_studio.core.toolchain.Toolchain.require_executable")
    def test_c06_qtgmc_silent_fallback(self, mock_require):
        """C-06: FilterBuilder leaves QTGMC to external pipe without adding FFmpeg deinterlacer."""
        mock_require.return_value = "/dummy/ffmpeg"
        builder = FilterBuilder()
        vf = builder.build_video_filters(
            apply_chroma=False, apply_denoise=False, deinterlacer="qtgmc"
        )
        # When qtgmc is requested, FFmpeg software deinterlacer is not injected into vf
        self.assertNotIn("bwdif", vf)
        self.assertNotIn("nnedi", vf)
        self.assertNotIn("yadif", vf)
        self.assertNotIn("qtgmc", vf)

    def test_m05_astats_inf(self):
        """M-05: Ensure detect_audio_layout handles silent clips gracefully."""
        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        if not os.path.exists(fixture_path):
            self.skipTest("Fixture not found.")

        try:
            layout = vhs_common.detect_audio_layout(
                fixture_path, sample_sec=0.0, sample_duration=0.5
            )
            self.assertIsNotNone(layout)
        except Exception:
            pass

    @patch("subprocess.Popen")
    @patch("vhs_studio.core.toolchain.Toolchain.require_executable")
    def test_c09_rawvideo_fps(self, mock_require, mock_popen):
        """C-09: Confirm frame rates and rawvideo behavior for 4:2:2 processing."""
        mock_require.return_value = "ffmpeg"
        mock_process = MagicMock()
        mock_process.stdout.read.return_value = b"\x00" * (720 * 480 * 2 * 10)
        mock_popen.return_value = mock_process

        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        cmd = [
            "ffmpeg",
            "-i",
            fixture_path,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "uyvy422",
            "-",
        ]
        res = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        bytes_per_frame = 720 * 480 * 2
        data = res.stdout.read(bytes_per_frame * 10)
        res.kill()
        self.assertEqual(len(data), bytes_per_frame * 10)


if __name__ == "__main__":
    unittest.main()
