"""Thread-safe subprocess execution and log streaming manager."""

import threading
import subprocess
from typing import Tuple, List, Optional


class ProcessManager:
    """Singleton process manager for non-blocking subprocess lifecycle and real-time log capturing."""

    _instance: Optional["ProcessManager"] = None
    _lock = threading.Lock()
    active_process: Optional[subprocess.Popen] = None
    process_logs: List[str] = []

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ProcessManager, cls).__new__(cls)
                cls._instance.active_process = None
                cls._instance.process_logs = []
        return cls._instance

    def start_process(self, cmd: List[str]) -> Tuple[bool, str]:
        """Spawn a new child process if no active process is currently executing."""
        with self._lock:
            if self.active_process is not None and self.active_process.poll() is None:
                return False, "A process is already running."

            self.process_logs.clear()
            self.active_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            # Start asynchronous background stdout reader thread
            t = threading.Thread(
                target=self._log_reader_thread,
                args=(self.active_process.stdout,),
                daemon=True,
            )
            t.start()
            return True, "Process started successfully."

    def _log_reader_thread(self, pipe) -> None:
        """Stream lines from subprocess stdout into bounded memory log buffer."""
        for line in pipe:
            with self._lock:
                self.process_logs.append(line.strip())
                if len(self.process_logs) > 500:
                    self.process_logs.pop(0)

    def get_logs(self) -> List[str]:
        """Return snapshot of accumulated process logs."""
        with self._lock:
            return list(self.process_logs)

    def is_running(self) -> bool:
        """Return True if the child process is currently alive and executing."""
        with self._lock:
            return (
                self.active_process is not None and self.active_process.poll() is None
            )

    def terminate(self) -> bool:
        """Terminate the running child process."""
        with self._lock:
            if self.active_process:
                self.active_process.terminate()
                self.active_process = None
                return True
        return False
