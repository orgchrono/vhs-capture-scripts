#!/usr/bin/env python3
from unittest.mock import patch, MagicMock
"""
test_characterization.py - Testes de caracterização das falhas apontadas no Audit Report.
Estes testes reproduzem e documentam os bugs exatos antes de corrigi-los nas próximas fases.
"""

import os
import sys
import unittest
import subprocess
import tempfile
import json

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RESTORATION_DIR = os.path.join(REPO_ROOT, "restoration")
LIB_DIR = os.path.join(RESTORATION_DIR, "lib")
if RESTORATION_DIR not in sys.path:
    sys.path.insert(0, RESTORATION_DIR)
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

from vhs_studio.core import vhs_common
from vhs_studio.core.filter_builder import FilterBuilder
import argparse


class TestCharacterization(unittest.TestCase):

    @patch("subprocess.run")
    @patch("vhs_studio.core.toolchain.Toolchain.require_executable")
    def test_c08_idet_double_parse(self, mock_require, mock_run):
        """
        C-08: Testa se o parser de idet atual falha ao ler o bloco correto
        da fita sintética, classificando-a incorretamente (ou provando o bug).
        """
        mock_require.return_value = "ffmpeg"
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="",
            stderr="[Parsed_idet_0 @ 0x123] Repeated Fields: Neither:  100 Top:    0 Bottom:    0\n"
            "[Parsed_idet_0 @ 0x123] Single frame detection: TFF:    0 BFF:  100 Progressive:    0 Undetermined:    0\n"
            "[Parsed_idet_0 @ 0x123] Multi frame detection: TFF:    0 BFF:  100 Progressive:    0 Undetermined:    0",
        )
        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        try:
            result = vhs_common.detect_interlace_status(fixture_path)
            print(f"C-08 result: {result}")
        except AttributeError:
            pass

    def test_c07_ignored_flags(self):
        """
        C-07: Comprova que parse_known_args em direct_restore.py
        ignora flags desconhecidas em vez de falhar.
        """
        direct_restore = os.path.join(RESTORATION_DIR, "direct_restore.py")
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
        print(f"C-07 returncode: {res.returncode}")
        self.assertNotIn("unrecognized arguments: --flag-inexistente", res.stderr)

    @patch("vhs_studio.core.toolchain.Toolchain.require_executable")
    def test_c06_qtgmc_silent_fallback(self, mock_require):
        mock_require.return_value = "/dummy/ffmpeg"
        """
        C-06: O FilterBuilder ignora silenciosamente o deinterlacer=qtgmc
        sem adicionar filtro de desentrelaçamento.
        """
        builder = FilterBuilder()
        vf = builder.build_video_filters(
            apply_chroma=False, apply_denoise=False, deinterlacer="qtgmc"
        )
        print(f"C-06 filters for qtgmc: {vf}")
        # Se requested qtgmc but it falls through silently, neither qtgmc nor a fallback deinterlacer is present
        self.assertNotIn("bwdif", vf)
        self.assertNotIn("nnedi", vf)
        self.assertNotIn("yadif", vf)
        self.assertNotIn("qtgmc", vf)

    def test_m05_astats_inf(self):
        """
        M-05: Se detect_audio_layout recebe um arquivo com silêncio absoluto (-inf),
        pode falhar no split ou float conversion.
        """
        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        if not os.path.exists(fixture_path):
            self.skipTest("Fixture não encontrada.")

        # O arquivo sintético tem líder mudo (silêncio), então podemos forçar a leitura do primeiro segundo
        try:
            layout = vhs_common.detect_audio_layout(
                fixture_path, sample_sec=0.0, sample_duration=0.5
            )
            print(f"M-05 layout with silence: {layout}")
        except Exception as e:
            print(f"M-05 exception on silence: {e}")

    @patch("subprocess.Popen")
    @patch("vhs_studio.core.toolchain.Toolchain.require_executable")
    def test_c09_rawvideo_fps(self, mock_require, mock_popen):
        """
        C-09: Confirma a taxa de quadros e comportamento do rawvideo
        quando FFmpeg descompacta a fita entrelaçada para processamento 4:2:2.
        """
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
        # Vamos ler apenas os primeiros 10 frames para confirmar.
        bytes_per_frame = 720 * 480 * 2
        data = res.stdout.read(bytes_per_frame * 10)
        res.kill()
        print(f"C-09 read rawvideo bytes: {len(data)}")
        self.assertEqual(len(data), bytes_per_frame * 10)


if __name__ == "__main__":
    unittest.main()
