#!/usr/bin/env python3
"""
test_vhs_common.py - Testes unitários para a biblioteca vhs_common e utilitários da pipeline.
Pode ser executado diretamente com: python -m unittest discover tests
"""

import os
import sys
import unittest
import tempfile

# Garante que o diretório de bibliotecas da restauração esteja no PYTHONPATH
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LIB_DIR = os.path.join(REPO_ROOT, "restoration", "lib")
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

import vhs_common


class TestVHSCommon(unittest.TestCase):

    def test_is_no_signal_black(self):
        """Verifica se frames de luma muito baixa (preto analógico/queda de sinal) são identificados."""
        is_nosig, reason = vhs_common.is_no_signal_frame(mean_luma=5.0, mean_cb=128.0, mean_cr=128.0)
        self.assertTrue(is_nosig)
        self.assertEqual(reason, "black")

        is_nosig, reason = vhs_common.is_no_signal_frame(mean_luma=18.0, mean_cb=128.0, mean_cr=128.0)
        self.assertTrue(is_nosig)
        self.assertEqual(reason, "black")

    def test_is_no_signal_blue_screen(self):
        """Verifica se a tela azul gerada por TBC/VCR é corretamente identificada."""
        is_nosig, reason = vhs_common.is_no_signal_frame(mean_luma=45.0, mean_cb=190.0, mean_cr=90.0)
        self.assertTrue(is_nosig)
        self.assertEqual(reason, "blue_screen")

    def test_is_normal_frame(self):
        """Verifica se frames com imagem de vídeo legítima não são classificados como sem sinal."""
        is_nosig, reason = vhs_common.is_no_signal_frame(mean_luma=110.0, mean_cb=128.0, mean_cr=128.0)
        self.assertFalse(is_nosig)
        self.assertEqual(reason, "normal")

        # Quase preto, mas acima do limiar seguro de 18 IRE
        is_nosig, reason = vhs_common.is_no_signal_frame(mean_luma=25.0, mean_cb=128.0, mean_cr=128.0)
        self.assertFalse(is_nosig)
        self.assertEqual(reason, "normal")

    def test_manifest_roundtrip(self):
        """Testa gravação e leitura do manifesto de sessão."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest_path = os.path.join(tmpdir, "test_manifest.json")
            sample_data = {
                "input_file": "sample.mkv",
                "fps": 29.97,
                "audio_policy": "stereo",
                "offset_ms": 0
            }
            vhs_common.write_manifest(manifest_path, sample_data)
            loaded = vhs_common.read_manifest(manifest_path)
            self.assertEqual(loaded, sample_data)

    def test_probe_media_synthetic(self):
        """Testa a inspeção técnica de metadados no clipe sintético."""
        synthetic_path = os.path.join(REPO_ROOT, "tests", "vhs_test_synthetic.mkv")
        if not os.path.exists(synthetic_path):
            self.skipTest("Clipe sintético vhs_test_synthetic.mkv não encontrado para teste de probe.")

        meta = vhs_common.probe_media(synthetic_path)
        self.assertEqual(meta["width"], 720)
        self.assertIn(meta["height"], [480, 486])
        self.assertAlmostEqual(meta["fps"], 29.97, places=2)
        self.assertGreater(meta["duration"], 9.0)
        self.assertEqual(meta["audio_channels"], 2)

    def test_black_hold_scan_synthetic(self):
        """Testa a detecção de líder e gaps sem-sinal com 00_black_hold.py."""
        synthetic_path = os.path.join(REPO_ROOT, "tests", "vhs_test_synthetic.mkv")
        black_hold_script = os.path.join(REPO_ROOT, "restoration", "stages", "2_restoration", "00_black_hold.py")
        if not os.path.exists(synthetic_path) or not os.path.exists(black_hold_script):
            self.skipTest("Dependências de teste não encontradas.")

        import subprocess
        res = subprocess.run(
            [sys.executable, black_hold_script, "--in", synthetic_path, "--dry-run"],
            capture_output=True, text=True
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("Início do conteúdo útil", res.stdout)
        self.assertIn("Perdas de sinal no meio", res.stdout)

    def test_detect_audio_layout_synthetic(self):
        """Testa se a detecção de áudio identifica canais balanceados na fita sintética."""
        synthetic_path = os.path.join(REPO_ROOT, "tests", "vhs_test_synthetic.mkv")
        if not os.path.exists(synthetic_path):
            self.skipTest("Fita sintética não encontrada.")

        layout = vhs_common.detect_audio_layout(synthetic_path, sample_sec=3.0, sample_duration=2.0)
        self.assertTrue(layout["detected"])
        self.assertIn(layout["layout"], ["dual_mono", "stereo"])

    def test_resolve_pipeline_strategy_progressive_60p(self):
        """Testa se a estratégia de desentrelaçamento é pulada para arquivos já em 60p."""
        meta = {"fps": 60.0, "width": 708, "height": 480}
        interlace_info = {"is_interlaced": False, "preferred_order": "bff", "summary": "Progressive"}
        audio_info = {"recommendation": "passthrough", "reason": "Estéreo normal"}

        strat = vhs_common.resolve_pipeline_strategy(meta, interlace_info, audio_info)
        self.assertEqual(strat["target_fps"], 60.0)
        self.assertFalse(strat["need_deinterlace"])
        self.assertEqual(strat["audio_policy"], "stereo")

    def test_resolve_pipeline_strategy_interlaced_2997i(self):
        """Testa se a estratégia de desentrelaçamento dobra a taxa para 29.97i nativo."""
        meta = {"fps": 29.97, "width": 720, "height": 480}
        interlace_info = {"is_interlaced": True, "preferred_order": "bff", "summary": "Interlaced BFF"}
        audio_info = {"recommendation": "duplicate_l_to_r", "reason": "Canal R mudo"}

        strat = vhs_common.resolve_pipeline_strategy(meta, interlace_info, audio_info)
        self.assertAlmostEqual(strat["target_fps"], 59.94, places=1)
        self.assertTrue(strat["need_deinterlace"])
        self.assertEqual(strat["audio_policy"], "mono_l")


if __name__ == "__main__":
    unittest.main()
