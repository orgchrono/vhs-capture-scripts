"""Unit tests for hardware profiling and performance tiering engine."""

import unittest
from unittest.mock import patch
from vhs_studio.core.hardware import get_ram_info, detect_gpu_info, get_hardware_profile


class TestHardwareProfiling(unittest.TestCase):
    """Test suite for system hardware profiling and honest capability assessment."""

    def test_get_ram_info(self):
        ram = get_ram_info()
        self.assertIn("total_gb", ram)
        self.assertIn("available_gb", ram)
        self.assertGreater(ram["total_gb"], 0.0)

    def test_detect_gpu_info(self):
        gpu = detect_gpu_info()
        self.assertIn("type", gpu)
        self.assertIn("name", gpu)
        self.assertIn("vulkan_available", gpu)
        self.assertIn("vram_gb", gpu)

    def test_get_hardware_profile(self):
        profile = get_hardware_profile()
        self.assertIn("tier", profile)
        self.assertIn(profile["tier"], [1, 2, 3, 4])
        self.assertIn("tier_name", profile)
        self.assertIn("recommendation", profile)
        self.assertIn("cpu", profile)
        self.assertIn("ram", profile)
        self.assertIn("gpu", profile)
        self.assertIn("ai_capabilities", profile)

    @patch("vhs_studio.core.hardware.detect_gpu_info")
    @patch("vhs_studio.core.hardware.get_ram_info")
    @patch("os.cpu_count", return_value=16)
    def test_tier_4_workstation(self, mock_cpu, mock_ram, mock_gpu):
        mock_ram.return_value = {"total_gb": 32.0, "available_gb": 24.0}
        mock_gpu.return_value = {
            "type": "dedicated",
            "name": "NVIDIA GeForce RTX 4080",
            "vulkan_available": True,
            "vram_gb": 16.0,
        }
        profile = get_hardware_profile()
        self.assertEqual(profile["tier"], 4)
        self.assertEqual(profile["tier_color"], "emerald")

    @patch("vhs_studio.core.hardware.detect_gpu_info")
    @patch("vhs_studio.core.hardware.get_ram_info")
    @patch("os.cpu_count", return_value=8)
    def test_tier_2_integrated(self, mock_cpu, mock_ram, mock_gpu):
        mock_ram.return_value = {"total_gb": 16.0, "available_gb": 8.0}
        mock_gpu.return_value = {
            "type": "integrated",
            "name": "Intel UHD Graphics 770",
            "vulkan_available": True,
            "vram_gb": 0.0,
        }
        profile = get_hardware_profile()
        self.assertEqual(profile["tier"], 2)
        self.assertEqual(profile["tier_color"], "amber")


if __name__ == "__main__":
    unittest.main()
