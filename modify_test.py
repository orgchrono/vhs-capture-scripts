import sys

with open("tests/test_vhs_common.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "def test_filter_builder_hardware_encoder(self):",
    "@patch('vhs_studio.core.toolchain.Toolchain.require_executable')\n    def test_filter_builder_hardware_encoder(self, mock_require):\n        mock_require.return_value = '/dummy/ffmpeg'"
)

with open("tests/test_vhs_common.py", "w", encoding="utf-8") as f:
    f.write(content)
