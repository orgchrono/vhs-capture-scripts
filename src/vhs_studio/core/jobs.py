"""Module documentation pending."""

import os
import sys
import atexit
from typing import Optional
from vhs_studio.core.logger import log


def is_pid_active(pid: int) -> bool:
    """Verify whether a given process ID is actively executing on the OS without strict external dependencies."""
    if pid <= 0:
        return False
    try:
        import psutil  # type: ignore[import-not-found]

        return psutil.pid_exists(pid)
    except ImportError:
        pass

    if sys.platform == "win32":
        try:
            import ctypes

            kernel32 = ctypes.windll.kernel32
            SYNCHRONIZE = 0x00100000
            process = kernel32.OpenProcess(SYNCHRONIZE, False, pid)
            if process:
                kernel32.CloseHandle(process)
                return True
            return False
        except Exception:
            pass

    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, ProcessLookupError):
        return False


class JobManager:
    """Manages PID-based file locks to prevent multiple concurrent pipeline executions."""

    @staticmethod
    def _get_lock_path():
        """Resolve canonical path to lock file."""
        from vhs_studio.core.paths import WORK_MEDIA_DIR

        work_dir = WORK_MEDIA_DIR
        os.makedirs(work_dir, exist_ok=True)
        return os.path.join(work_dir, ".pipeline.lock")

    @staticmethod
    def _read_lock_pid(lock_path: str) -> Optional[int]:
        """Read PID from lock file safely."""
        if not os.path.exists(lock_path):
            return None
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
            return int(content.split(":")[0])
        except Exception:
            return None

    @staticmethod
    def acquire_lock():
        """Attempt to acquire process lock. If previous owner is dead, cleans and re-acquires."""
        lock_path = JobManager._get_lock_path()
        pid = JobManager._read_lock_pid(lock_path)

        if pid is not None:
            if is_pid_active(pid):
                log.error(
                    f"[WARNING] Another pipeline instance is already running! (PID {pid})"
                )
                sys.exit(1)
            else:
                log.warning(
                    f"[INFO] Stale lock from dead process detected (PID {pid}). Replacing..."
                )
                os.remove(lock_path)
        elif os.path.exists(lock_path):
            # Stale corrupted lock file
            os.remove(lock_path)

        with open(lock_path, "w", encoding="utf-8") as f:
            f.write(f"{os.getpid()}:pipeline_running")
        atexit.register(JobManager.release_lock)

    @staticmethod
    def release_lock():
        """Release process lock if owned by the current process."""
        lock_path = JobManager._get_lock_path()
        pid = JobManager._read_lock_pid(lock_path)
        if pid == os.getpid():
            try:
                os.remove(lock_path)
            except Exception:
                pass
