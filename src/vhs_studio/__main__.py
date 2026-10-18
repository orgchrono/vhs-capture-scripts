"""Module documentation pending."""

import sys
import os
import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()

    # Prevent PyInstaller --windowed crash when sys.stdout/stderr is None
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

    from vhs_studio.cli.main import main

    sys.exit(main())
