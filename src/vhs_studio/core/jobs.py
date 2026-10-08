"""Module documentation pending."""

import os
import sys
import psutil
from typing import Optional
from vhs_studio.core.logger import log


class JobManager:
    """Gerencia locks de processo baseados em PID para evitar multiplas execucoes concorrentes."""

    @staticmethod
    def _get_lock_path():
        """Documentation for _get_lock_path."""
        from vhs_studio.core.paths import WORK_MEDIA_DIR

        work_dir = WORK_MEDIA_DIR
        os.makedirs(work_dir, exist_ok=True)
        return os.path.join(work_dir, ".pipeline.lock")

    @staticmethod
    def _read_lock_pid(lock_path: str) -> Optional[int]:
        """Le o PID do arquivo de lock de forma segura."""
        if not os.path.exists(lock_path):
            return None
        try:
            with open(lock_path, "r") as f:
                content = f.read().strip()
            return int(content.split(":")[0])
        except Exception:
            return None

    @staticmethod
    def acquire_lock():
        """Tenta adquirir o lock. Se o processo dono morreu, limpa e readquire."""
        lock_path = JobManager._get_lock_path()
        pid = JobManager._read_lock_pid(lock_path)

        if pid is not None:
            if psutil.pid_exists(pid):
                log.error(
                    f"[AVISO] Ja existe outra instancia do pipeline em execucao! (PID {pid})"
                )
                sys.exit(1)
            else:
                log.warning(
                    f"[INFO] Lock antigo de processo morto detectado (PID {pid}). Substituindo..."
                )
                os.remove(lock_path)
        elif os.path.exists(lock_path):
            # lock file exists mas ta corrompido (retornou None)
            os.remove(lock_path)

        with open(lock_path, "w") as f:
            f.write(f"{os.getpid()}:pipeline_running")

    @staticmethod
    def release_lock():
        """Remove o lock se ele for do processo atual."""
        lock_path = JobManager._get_lock_path()
        pid = JobManager._read_lock_pid(lock_path)
        if pid == os.getpid():
            try:
                os.remove(lock_path)
            except Exception:
                pass
