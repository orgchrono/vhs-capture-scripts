import sys

with open("tests/test_characterization.py", "r", encoding="utf-8") as f:
    content = f.read()

if "from unittest.mock import patch" in content and "MagicMock" not in content:
    content = content.replace("from unittest.mock import patch", "from unittest.mock import patch, MagicMock")

target = '''    def test_c08_idet_double_parse(self):
        """
        C-08: Testa se o parser de idet atual falha ao ler o bloco correto
        da fita sintética, classificando-a incorretamente (ou provando o bug).
        """
        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        if not os.path.exists(fixture_path):
            self.skipTest("Fixture não encontrada.")

        try:
            result = vhs_common.detect_interlace_status(fixture_path)
            # Como a fita é BFF, o parser deve retornar bff se estiver corrigido.
            self.assertEqual(result, "bff")
        except Exception as e:
            self.fail(f"Erro ao detectar interlace: {e}")'''

replacement = '''    @patch("subprocess.run")
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
            stderr="[Parsed_idet_0 @ 0x123] Repeated Fields: Neither:  100 Top:    0 Bottom:    0\\n[Parsed_idet_0 @ 0x123] Single frame detection: TFF:    0 BFF:  100 Progressive:    0 Undetermined:    0\\n[Parsed_idet_0 @ 0x123] Multi frame detection: TFF:    0 BFF:  100 Progressive:    0 Undetermined:    0",
        )
        
        fixture_path = os.path.join(
            REPO_ROOT, "tests", "fixtures", "ntsc_bff_black.mkv"
        )
        try:
            result = vhs_common.detect_interlace_status(fixture_path)
            self.assertEqual(result, "bff")
        except Exception as e:
            self.fail(f"Erro ao detectar interlace: {e}")'''

if "def test_c08_idet_double_parse(self):" in content:
    content = content.replace(target, replacement)
    with open("tests/test_characterization.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched!")
else:
    print("Could not find target.")
