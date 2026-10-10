"""Module documentation pending."""

import subprocess
import json
from vhs_studio.core.toolchain import Toolchain


class QualityControl:
    """Documentation for QualityControl."""

    @staticmethod
    def run_qc(filepath):
        """Roda signalstats e ffprobe e gera um relatório."""
        ffprobe = Toolchain.get_ffprobe_path()
        cmd = [
            ffprobe,
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            filepath,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        if res.returncode == 0:
            data = json.loads(res.stdout)
            report_path = f"{filepath}_qc_report.json"
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            return report_path
        return None
