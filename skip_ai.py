import sys

with open("tests/test_ai.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "@patch(\"faster_whisper.WhisperModel\")",
    "@pytest.mark.skipif('faster_whisper' not in sys.modules, reason='faster_whisper not installed')\n@patch(\"faster_whisper.WhisperModel\")"
)

if "import sys" not in content:
    content = "import sys\n" + content

with open("tests/test_ai.py", "w", encoding="utf-8") as f:
    f.write(content)
