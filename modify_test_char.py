import sys

with open("tests/test_characterization.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "def test_c06_qtgmc_silent_fallback(self):",
    "@patch('vhs_studio.core.toolchain.Toolchain.require_executable')\n    def test_c06_qtgmc_silent_fallback(self, mock_require):\n        mock_require.return_value = '/dummy/ffmpeg'"
)

with open("tests/test_characterization.py", "w", encoding="utf-8") as f:
    f.write(content)
