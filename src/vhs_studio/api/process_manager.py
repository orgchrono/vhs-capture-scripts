import threading
import subprocess


class ProcessManager:
    """Gerencia processos filhos de forma thread-safe."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ProcessManager, cls).__new__(cls)
                cls._instance.active_process = None
                cls._instance.process_logs = []
        return cls._instance

    def start_process(self, cmd):
        with self._lock:
            if self.active_process is not None and self.active_process.poll() is None:
                return False, "Processo já em andamento"

            self.process_logs.clear()
            self.active_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            # Start reader thread
            t = threading.Thread(
                target=self._log_reader_thread,
                args=(self.active_process.stdout,),
                daemon=True,
            )
            t.start()
            return True, "Processo iniciado"

    def _log_reader_thread(self, pipe):
        for line in pipe:
            with self._lock:
                self.process_logs.append(line.strip())
                if len(self.process_logs) > 500:
                    self.process_logs.pop(0)

    def get_logs(self):
        with self._lock:
            return list(self.process_logs)

    def is_running(self):
        with self._lock:
            return self.active_process is not None and self.active_process.poll() is None

    def terminate(self):
        with self._lock:
            if self.active_process:
                self.active_process.terminate()
                self.active_process = None
                return True
        return False
