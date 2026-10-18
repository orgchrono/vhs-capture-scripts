"""Subprocess execution wrappers ensuring invisible background execution without flashing console windows."""

import os
import subprocess
import sys
from typing import Any, List, Union


def get_creation_flags() -> int:
    """Return CREATE_NO_WINDOW flag on Windows to prevent console windows popping up in GUI applications."""
    if sys.platform == "win32" or os.name == "nt":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0


def run_silent(
    cmd: Union[List[str], str],
    **kwargs: Any
) -> subprocess.CompletedProcess:
    """Execute a subprocess command silently without creating a visible console window on Windows."""
    flags = get_creation_flags()
    if flags and "creationflags" not in kwargs:
        kwargs["creationflags"] = flags
    return subprocess.run(cmd, **kwargs)


def popen_silent(
    cmd: Union[List[str], str],
    **kwargs: Any
) -> subprocess.Popen:
    """Spawn a subprocess asynchronously without creating a visible console window on Windows."""
    flags = get_creation_flags()
    if flags and "creationflags" not in kwargs:
        kwargs["creationflags"] = flags
    return subprocess.Popen(cmd, **kwargs)
