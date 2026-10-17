"""Thread-safe subprocess execution and log streaming manager."""

import threading
import subprocess
import re
from typing import Any, Callable, Dict, Tuple, List, Optional

from vhs_studio.core.constants import MAX_PROCESS_LOGS_HISTORY

ANSI_ESCAPE_RE = re.compile(r"(?:\x1b|\u001b)\[[0-9;]*[a-zA-Z]|\x1b\[[0-9;]*m|\[[0-9;]{1,3}m")


def make_process_state_closure() -> Dict[str, Callable[..., Any]]:
    """Create a lexical closure encapsulating subprocess state and log history without class-level globals."""
    state: Dict[str, Any] = {
        "active_process": None,
        "process_logs": [],
        "last_exit_code": None,
        "last_success": None,
        "is_paused": False,
    }

    def get_val(key: str) -> Any:
        return state.get(key)

    def set_val(key: str, val: Any) -> None:
        state[key] = val

    def append_log(line: str) -> None:
        logs: List[str] = state["process_logs"]
        logs.append(line)
        if len(logs) > MAX_PROCESS_LOGS_HISTORY:
            logs.pop(0)

    def clear_logs() -> None:
        state["process_logs"].clear()

    return {
        "get": get_val,
        "set": set_val,
        "append_log": append_log,
        "clear_logs": clear_logs,
    }


class ProcessManager:
    """Singleton process manager backed by a lexical state closure for non-blocking subprocess lifecycle."""

    _instance: Optional["ProcessManager"] = None
    _lock = threading.Lock()
    _closure: Dict[str, Callable[..., Any]]

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                instance = super(ProcessManager, cls).__new__(cls)
                instance._closure = make_process_state_closure()
                cls._instance = instance
        return cls._instance

    @property
    def active_process(self) -> Optional[subprocess.Popen]:
        return self._closure["get"]("active_process")

    @active_process.setter
    def active_process(self, value: Optional[subprocess.Popen]) -> None:
        self._closure["set"]("active_process", value)

    @property
    def process_logs(self) -> List[str]:
        return self._closure["get"]("process_logs")

    @process_logs.setter
    def process_logs(self, value: List[str]) -> None:
        self._closure["set"]("process_logs", value)

    @property
    def last_exit_code(self) -> Optional[int]:
        return self._closure["get"]("last_exit_code")

    @last_exit_code.setter
    def last_exit_code(self, value: Optional[int]) -> None:
        self._closure["set"]("last_exit_code", value)

    @property
    def last_success(self) -> Optional[bool]:
        return self._closure["get"]("last_success")

    @last_success.setter
    def last_success(self, value: Optional[bool]) -> None:
        self._closure["set"]("last_success", value)

    @property
    def is_paused(self) -> bool:
        return bool(self._closure["get"]("is_paused"))

    @is_paused.setter
    def is_paused(self, value: bool) -> None:
        self._closure["set"]("is_paused", bool(value))

    def start_process(self, cmd: List[str]) -> Tuple[bool, str]:
        """Spawn a new child process if no active process is currently executing."""
        with self._lock:
            if self.active_process is not None and self.active_process.poll() is None:
                return False, "A process is already running."

            self._closure["clear_logs"]()
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
                        self._closure["append_log"](clean_line)

        proc.wait()
        exit_code = proc.returncode
        with self._lock:
            self.last_exit_code = exit_code
            self.last_success = (exit_code == 0)
            if exit_code != 0:
                self._closure["append_log"](
                    f"[PROCESSO ERRO] Processo finalizado com erro (Exit Code: {exit_code})"
                )
            else:
                self._closure["append_log"](
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
                self._closure["append_log"](
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
                self._closure["append_log"](
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
            self._closure["append_log"](
                "[PROCESSO] Processo abortado pelo operador. Árvore de subprocessos encerrada."
            )
            return True
