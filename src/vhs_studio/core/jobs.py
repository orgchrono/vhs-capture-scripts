import os
import sys
import psutil
from vhs_studio.core.logger import log


class JobManager:
    """Gerencia locks de processo baseados em PID para evitar múltiplas execuções concorrentes."""

    @staticmethod
    def _get_lock_path():
        work_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "media", "work"))
        os.makedirs(work_dir, exist_ok=True)
        return os.path.join(work_dir, ".pipeline.lock")

    @staticmethod
    def acquire_lock():
        """Tenta adquirir o lock. Se o processo dono morreu, limpa e readquire."""
        lock_path = JobManager._get_lock_path()
        if os.path.exists(lock_path):
            with open(lock_path, "r") as f:
                content = f.read().strip()

            try:
                pid = int(content.split(":")[0])
                if psutil.pid_exists(pid):
                    log.error(f"[AVISO] Já existe outra instância do pipeline em execução! (PID {pid})")
                    sys.exit(1)
                else:
                    log.warning(f"[INFO] Encontrado lock antigo de um processo morto (PID {pid}). Removendo...")
                    os.remove(lock_path)
            except Exception:
                log.warning("[INFO] Arquivo de lock corrompido. Removendo...")
                os.remove(lock_path)

        with open(lock_path, "w") as f:
            f.write(f"{os.getpid()}:pipeline_running")

    @staticmethod
    def release_lock():
        """Remove o lock se ele for do processo atual."""
        lock_path = JobManager._get_lock_path()
        if os.path.exists(lock_path):
            with open(lock_path, "r") as f:
                content = f.read().strip()
            try:
                pid = int(content.split(":")[0])
                if pid == os.getpid():
                    os.remove(lock_path)
            except Exception:
                pass
