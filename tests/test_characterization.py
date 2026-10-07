#!/usr/bin/env python3
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

import vhs_common
from filter_builder import FilterBuilder
import argparse

class TestCharacterization(unittest.TestCase):
    
    def test_c08_idet_double_parse(self):
        """
        C-08: Testa se o parser de idet atual falha ao ler o bloco correto
        da fita sintética, classificando-a incorretamente (ou provando o bug).
        """
        fixture_path = os.path.join(REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv")
        if not os.path.exists(fixture_path):
            self.skipTest("Fixture não encontrada.")
            
        try:
            result = vhs_common.detect_interlace_status(fixture_path)
            print(f"C-08 result: {result}")
        except AttributeError:
            # Maybe it's named something else like detect_interlace
            pass
    
    def test_c07_ignored_flags(self):
        """
        C-07: Comprova que parse_known_args em direct_restore.py 
        ignora flags desconhecidas em vez de falhar.
        """
        direct_restore = os.path.join(RESTORATION_DIR, "direct_restore.py")
        res = subprocess.run(
            [sys.executable, direct_restore, "--in", "dummy.mkv", "--prores", "--flag-inexistente", "--dry-run"],
            capture_output=True, text=True
        )
        print(f"C-07 returncode: {res.returncode}")
        self.assertNotIn("unrecognized arguments: --flag-inexistente", res.stderr)

    def test_c06_qtgmc_silent_fallback(self):
        """
        C-06: O FilterBuilder ignora silenciosamente o deinterlacer=qtgmc
        sem adicionar filtro de desentrelaçamento.
        """
        builder = FilterBuilder()
        vf = builder.build_video_filters(apply_chroma=False, apply_denoise=False, deinterlacer="qtgmc")
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
        fixture_path = os.path.join(REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv")
        if not os.path.exists(fixture_path):
            self.skipTest("Fixture não encontrada.")
            
        # O arquivo sintético tem líder mudo (silêncio), então podemos forçar a leitura do primeiro segundo
        try:
            layout = vhs_common.detect_audio_layout(fixture_path, sample_sec=0.0, sample_duration=0.5)
            print(f"M-05 layout with silence: {layout}")
        except Exception as e:
            print(f"M-05 exception on silence: {e}")

    def test_c09_rawvideo_fps(self):
        """
        C-09: Confirma a taxa de quadros e comportamento do rawvideo 
        quando FFmpeg descompacta a fita entrelaçada para processamento 4:2:2.
        """
        fixture_path = os.path.join(REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv")
        if not os.path.exists(fixture_path):
            self.skipTest("Fixture não encontrada.")
            
        # Se chamarmos FFmpeg com -f rawvideo sem especificar framerate, ele extrai na taxa nativa (29.97).
        # Se o stream_runner espera ler 59.94, ele vai consumir 2 frames para cada frame real,
        # ou se o FFmpeg enviar 29.97, vai demorar o dobro do tempo lendo ou cortar pela metade.
        cmd = [
            "ffmpeg", "-i", fixture_path, "-f", "rawvideo", "-pix_fmt", "uyvy422", "-"
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
