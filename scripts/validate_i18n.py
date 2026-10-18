import sys
import subprocess
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    cmd = [
        "cargo", "run", "--manifest-path", str(root / "src-tauri" / "Cargo.toml"),
        "--", "validate-i18n", str(root / "ui" / "src" / "locales")
    ]
    res = subprocess.run(cmd)
    return res.returncode


if __name__ == "__main__":
    sys.exit(main())
