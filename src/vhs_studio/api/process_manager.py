"""Thread-safe subprocess execution and log streaming manager."""

import threading
import subprocess
import re
from typing import Tuple, List, Optional

from vhs_studio.core.constants import MAX_PROCESS_LOGS_HISTORY

ANSI_ESCAPE_RE = re.compile(r"(?:\x1b|\u001b)\[[0-9;]*[a-zA-Z]|\x1b\[[0-9;]*m|\[[0-9;]{1,3}m")


class ProcessManager:
    """Singleton process manager for non-blocking subprocess lifecycle and real-time log capturing."""

    _instance: Optional["ProcessManager"] = None
    _lock = threading.Lock()
    active_process: Optional[subprocess.Popen] = None
    process_logs: List[str] = []
    last_exit_code: Optional[int] = None
    last_success: Optional[bool] = None
    is_paused: bool = False

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ProcessManager, cls).__new__(cls)
                cls._instance.active_process = None
                cls._instance.process_logs = []
                cls._instance.last_exit_code = None
                cls._instance.last_success = None
                cls._instance.is_paused = False
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
                clean_line = ANSI_ESCAPE_RE.sub("", line).strip()
                if clean_line:
                    with self._lock:
                        self.process_logs.append(clean_line)
                        if len(self.process_logs) > MAX_PROCESS_LOGS_HISTORY:
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

    def pause(self) -> Tuple[bool, str]:
        """Suspend the active process and all child processes, freezing CPU/GPU execution."""
        with self._lock:
            if not self.active_process or self.active_process.poll() is not None:
                return False, "No active process to pause."
            if self.is_paused:
                return False, "Process is already paused."

            try:
                import psutil
                parent = psutil.Process(self.active_process.pid)
                processes = [parent] + parent.children(recursive=True)
                for p in processes:
                    try:
                        p.suspend()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                self.is_paused = True
                self.process_logs.append(
                    "[PROCESSO] Processo pausado pelo operador. Recursos de hardware (CPU/GPU) liberados."
                )
                return True, "Process paused successfully."
            except Exception as e:
                return False, f"Failed pausing process: {e}"

    def resume(self) -> Tuple[bool, str]:
        """Resume execution of the paused process and its child subprocesses."""
        with self._lock:
            if not self.active_process or self.active_process.poll() is not None:
                return False, "No active process to resume."
            if not self.is_paused:
                return False, "Process is not paused."

            try:
                import psutil
                parent = psutil.Process(self.active_process.pid)
                processes = [parent] + parent.children(recursive=True)
                for p in processes:
                    try:
                        p.resume()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                self.is_paused = False
                self.process_logs.append(
                    "[PROCESSO] Processo retomado. Restauração continuando de onde parou."
                )
                return True, "Process resumed successfully."
            except Exception as e:
                return False, f"Failed resuming process: {e}"

    def terminate(self) -> bool:
        """Terminate active process tree cleanly without leaving orphaned FFmpeg or AI subprocesses."""
        with self._lock:
            if not self.active_process:
                return False

            pid = self.active_process.pid
            try:
                import psutil
                try:
                    parent = psutil.Process(pid)
                    children = parent.children(recursive=True)
                    # First resume if paused so they can respond to terminate signals
                    if self.is_paused:
                        for p in [parent] + children:
                            try:
                                p.resume()
                            except Exception:
                                pass
                        self.is_paused = False

                    for child in children:
                        try:
                            child.terminate()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    gone, alive = psutil.wait_procs(children, timeout=1.5)
                    for child in alive:
                        try:
                            child.kill()
                        except Exception:
                            pass
                    parent.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            except Exception:
                try:
                    self.active_process.terminate()
                except Exception:
                    pass

            self.last_exit_code = -1
            self.last_success = False
            self.is_paused = False
            self.active_process = None
            self.process_logs.append(
                "[PROCESSO] Processo abortado pelo operador. Árvore de subprocessos encerrada."
            )
            return True
