"""Unit tests for the native Terminal User Interface (TUI) module."""

import unittest
from unittest.mock import patch, MagicMock
from vhs_studio.cli.tui import TuiState, render_tui, _run_pipeline_worker


class TestTuiWorkstation(unittest.TestCase):
    """Test suite for TUI state management, rendering, and pipeline orchestration."""

    def setUp(self):
        self.state = TuiState()

    def test_initial_state(self):
        self.assertEqual(self.state.preset, "gold")
        self.assertEqual(self.state.params["deinterlacer"], "bwdif")
        self.assertFalse(self.state.is_running)
        self.assertEqual(self.state.progress_pct, 0)
        self.assertIn("tier", self.state.hardware)

    def test_apply_presets(self):
        # Speed
        self.state.apply_preset("speed")
        self.assertEqual(self.state.preset, "speed")
        self.assertEqual(self.state.params["mode"], "passthrough")
        self.assertFalse(self.state.params["chroma_fix"])

        # TBC Hold
        self.state.apply_preset("tbc_hold")
        self.assertEqual(self.state.preset, "tbc_hold")
        self.assertEqual(self.state.params["deinterlacer"], "znedi3")
        self.assertEqual(self.state.params["mode"], "freeze")
        self.assertTrue(self.state.params["dropout_clean"])

        # AI Master
        self.state.apply_preset("ai_master")
        self.assertEqual(self.state.preset, "ai_master")
        self.assertTrue(self.state.params["ai_whisper"])
        self.assertTrue(self.state.params["ai_face_restore"])
        self.assertTrue(self.state.params["ai_rife_60fps"])
        self.assertTrue(self.state.params["ai_upscaler"])

    @patch("os.path.exists", return_value=True)
    @patch("os.listdir", return_value=["family_tape.mkv", "vacation.mp4", "readme.txt"])
    @patch("os.path.getsize", return_value=1024 * 1024 * 500)
    def test_refresh_tapes(self, mock_size, mock_list, mock_exists):
        self.state.refresh_tapes()
        self.assertEqual(len(self.state.tapes), 2)
        self.assertEqual(self.state.tapes[0]["name"], "family_tape.mkv")
        self.assertEqual(self.state.tapes[1]["name"], "vacation.mp4")

    def test_render_tui_buffer(self):
        rendered = render_tui(self.state)
        self.assertIn("VHS STUDIO PRO - ESTAÇÃO DE TRABALHO EM TERMINAL (TUI)", rendered)
        self.assertIn("Gold Archive", rendered)
        self.assertIn("TELEMETRIA & EXECUÇÃO DO DAG", rendered)
        self.assertIn("INICIAR", rendered)
        self.assertIn("Sair", rendered)

    def test_add_log_buffer_rotation(self):
        for i in range(10):
            self.state.add_log(f"Test log entry {i}")
        self.assertEqual(len(self.state.recent_logs), 6)
        self.assertEqual(self.state.recent_logs[-1], "Test log entry 9")

    @patch("vhs_studio.pipeline.PipelineOrchestrator")
    def test_pipeline_worker_success(self, mock_orch_cls):
        mock_orch = MagicMock()
        mock_orch_cls.return_value = mock_orch

        _run_pipeline_worker(self.state, "input.mkv", "output.mp4", self.state.params)

        self.assertFalse(self.state.is_running)
        self.assertEqual(self.state.progress_pct, 100)
        self.assertIn("Concluído", self.state.current_stage)
        mock_orch.start.assert_called_once()

    @patch("vhs_studio.pipeline.PipelineOrchestrator")
    def test_pipeline_worker_failure(self, mock_orch_cls):
        mock_orch = MagicMock()
        mock_orch.start.side_effect = RuntimeError("VapourSynth pipeline broken")
        mock_orch_cls.return_value = mock_orch

        _run_pipeline_worker(self.state, "input.mkv", "output.mp4", self.state.params)

        self.assertFalse(self.state.is_running)
        self.assertIn("Erro", self.state.current_stage)
        self.assertTrue(any("Falha no pipeline" in log for log in self.state.recent_logs))


if __name__ == "__main__":
    unittest.main()
