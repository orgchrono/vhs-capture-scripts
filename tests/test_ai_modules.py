"""Unit tests for modular AI restoration components."""

import unittest
from vhs_studio.ai.audio_denoiser import AudioDenoiser
from vhs_studio.ai.face_restorer import FaceRestorer
from vhs_studio.video.dropout_cleaner import DropoutCleaner
from vhs_studio.video.rife_interpolator import RifeInterpolator
from vhs_studio.video.ai_upscaler import AIUpscaler
from vhs_studio.core.constants import (
    DEFAULT_CODEFORMER_FIDELITY,
    DEFAULT_RIFE_TARGET_FPS,
    DEFAULT_UPSCALER_MODEL,
)


class TestAIModules(unittest.TestCase):
    """Test suite for neural restoration models and DSP tape filters."""

    def test_audio_denoiser(self):
        self.assertIsInstance(AudioDenoiser.is_deepfilter_available(), bool)

    def test_face_restorer_initialization(self):
        restorer = FaceRestorer(fidelity_weight=DEFAULT_CODEFORMER_FIDELITY)
        self.assertEqual(restorer.fidelity_weight, DEFAULT_CODEFORMER_FIDELITY)
        self.assertIsInstance(restorer.is_available(), bool)

    def test_dropout_cleaner_filter(self):
        f = DropoutCleaner.get_ffmpeg_filter()
        self.assertIn("removegrain", f)
        self.assertIn("tmedian", f)

    def test_dropout_line_detection(self):
        # Normal scanline
        normal_line = bytes([128] * 720)
        self.assertFalse(DropoutCleaner.is_dropout_line(normal_line))

        # Blank/empty
        self.assertFalse(DropoutCleaner.is_dropout_line(b""))

        # Saturated white streak (90% >= 235)
        streak_line = bytes([255] * 680 + [100] * 40)
        self.assertTrue(DropoutCleaner.is_dropout_line(streak_line))

    def test_rife_interpolator_initialization(self):
        rife = RifeInterpolator(target_fps=DEFAULT_RIFE_TARGET_FPS)
        self.assertEqual(rife.target_fps, DEFAULT_RIFE_TARGET_FPS)
        self.assertIsInstance(rife.is_available(), bool)

    def test_ai_upscaler_initialization(self):
        upscaler = AIUpscaler(model_name=DEFAULT_UPSCALER_MODEL)
        self.assertEqual(upscaler.model_name, DEFAULT_UPSCALER_MODEL)

        cugan = AIUpscaler(model_name="models-se")
        self.assertEqual(cugan.model_name, "models-se")


if __name__ == "__main__":
    unittest.main()
