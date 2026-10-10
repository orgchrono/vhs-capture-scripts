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
    last_exit_code: Optional[int] = None
    last_success: Optional[bool] = None

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ProcessManager, cls).__new__(cls)
                cls._instance.active_process = None
                cls._instance.process_logs = []
                cls._instance.last_exit_code = None
                cls._instance.last_success = None
        return cls._instance

    def start_process(self, cmd: List[str]) -> Tuple[bool, str]:
        """Spawn a new child process if no active process is currently executing."""
        with self._lock:
            if self.active_process is not None and self.active_process.poll() is None:
                return False, "A process is already running."

            self.process_logs.clear()
            self.last_exit_code = None
            self.last_success = None
            self.active_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )

            # Start asynchronous background stdout reader thread
            t = threading.Thread(
                target=self._log_reader_thread,
                args=(self.active_process,),
                daemon=True,
            )
            t.start()
            return True, "Process started successfully."

    def _log_reader_thread(self, proc: subprocess.Popen) -> None:
        """Stream lines from subprocess stdout and capture final returncode."""
        if proc.stdout:
            for line in proc.stdout:
                clean_line = line.strip()
                if clean_line:
                    with self._lock:
                        self.process_logs.append(clean_line)
                        if len(self.process_logs) > 500:
                            self.process_logs.pop(0)

        proc.wait()
        exit_code = proc.returncode
        with self._lock:
            self.last_exit_code = exit_code
            self.last_success = (exit_code == 0)
            if exit_code != 0:
                self.process_logs.append(
                    f"[PROCESSO ERRO] Processo finalizado com erro (Exit Code: {exit_code})"
                )
            else:
                self.process_logs.append(
                    "[PROCESSO] Processo finalizado com sucesso (Exit Code: 0)"
                )

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
                self.last_exit_code = -1
                self.last_success = False
                self.active_process = None
                return True
        return False
