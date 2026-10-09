"""Persistent SQLite-backed batch queue manager for sequential and scheduled processing."""

import sqlite3
import os
import json
import threading
import time
from typing import Optional, List, Dict, Any
from vhs_studio.core.logger import log

DEFAULT_QUEUE_DB_PATH = os.path.join(
    os.path.expanduser("~"), ".vhs_studio", "pipeline_queue.db"
)


class PersistentQueueManager:
    """Manages persistent batch queues with configurable concurrency (defaults to sequential FIFO)."""

    def __init__(self, db_path: str = DEFAULT_QUEUE_DB_PATH, max_concurrent: int = 1):
        self.db_path = db_path
        self.max_concurrent = max_concurrent
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Create database directory and return connection."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Initialize database schema if not present."""
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    raw_path TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    priority INTEGER DEFAULT 0,
                    params TEXT DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    error_message TEXT DEFAULT NULL
                )
                """
            )
            conn.commit()
            conn.close()

    def enqueue(
        self, raw_path: str, params: Optional[Dict[str, Any]] = None, priority: int = 0
    ) -> int:
        """Enqueue a new media processing job."""
        params_str = json.dumps(params or {})
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO jobs (raw_path, status, priority, params)
                VALUES (?, 'pending', ?, ?)
                """,
                (raw_path, priority, params_str),
            )
            job_id = cursor.lastrowid or 0
            conn.commit()
            conn.close()
            log.info(f"[QUEUE] Enqueued job #{job_id}: {raw_path}")
            return job_id

    def get_next_pending_job(self) -> Optional[Dict[str, Any]]:
        """Fetch the next pending job in FIFO priority order and mark it processing."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM jobs
                WHERE status = 'pending'
                ORDER BY priority DESC, id ASC
                LIMIT 1
                """
            )
            row = cursor.fetchone()
            if row:
                job_id = row["id"]
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = 'processing', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (job_id,),
                )
                conn.commit()
                job_data = dict(row)
                job_data["status"] = "processing"
                job_data["params"] = json.loads(job_data["params"])
                conn.close()
                return job_data
            conn.close()
            return None

    def complete_job(self, job_id: int) -> None:
        """Mark job as successfully completed."""
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                """
                UPDATE jobs
                SET status = 'completed', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (job_id,),
            )
            conn.commit()
            conn.close()
            log.info(f"[QUEUE] Job #{job_id} marked as completed.")

    def fail_job(self, job_id: int, error_message: str) -> None:
        """Mark job as failed with recorded error string."""
        with self._lock:
            conn = self._get_connection()
            conn.execute(
                """
                UPDATE jobs
                SET status = 'failed', updated_at = CURRENT_TIMESTAMP, error_message = ?
                WHERE id = ?
                """,
                (error_message, job_id),
            )
            conn.commit()
            conn.close()
            log.error(f"[QUEUE] Job #{job_id} failed: {error_message}")

    def cancel_job(self, job_id: int) -> bool:
        """Cancel a pending job."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE jobs
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'pending'
                """,
                (job_id,),
            )
            rows = cursor.rowcount
            conn.commit()
            conn.close()
            return rows > 0

    def list_jobs(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List jobs filtered by status or all jobs."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            if status:
                cursor.execute(
                    "SELECT * FROM jobs WHERE status = ? ORDER BY id DESC",
                    (status,),
                )
            else:
                cursor.execute("SELECT * FROM jobs ORDER BY id DESC")
            rows = cursor.fetchall()
            jobs = []
            for r in rows:
                d = dict(r)
                d["params"] = json.loads(d.get("params", "{}"))
                jobs.append(d)
            conn.close()
            return jobs

    def get_stats(self) -> Dict[str, int]:
        """Return counts of jobs grouped by status."""
        with self._lock:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT status, COUNT(*) as count
                FROM jobs
                GROUP BY status
                """
            )
            stats = {"pending": 0, "processing": 0, "completed": 0, "failed": 0}
            for row in cursor.fetchall():
                stats[row["status"]] = row["count"]
            conn.close()
            return stats


# Global queue manager instance (Sequential mode by default for low CPU/RAM safety)
queue_manager = PersistentQueueManager()


class QueueWorker:
    """Sequential background daemon for safely consuming queued batch rendering tasks."""

    def __init__(self, manager: PersistentQueueManager = queue_manager):
        self.manager = manager
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start worker thread."""
        if not self._running:
            self._running = True
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()
            log.info("[QUEUE WORKER] Batch worker thread started.")

    def stop(self):
        """Stop worker loop."""
        self._running = False

    def _run_loop(self):
        """Sequential polling and task execution loop."""
        from vhs_studio.api.server import pm
        import sys

        while self._running:
            if not pm.is_running():
                job = self.manager.get_next_pending_job()
                if job:
                    job_id = job["id"]
                    raw_path = job["raw_path"]
                    params = job["params"]
                    log.info(f"[QUEUE WORKER] Starting processing of job #{job_id}: {raw_path}")

                    params_json = json.dumps(params)
                    cmd = [
                        sys.executable,
                        "-m",
                        "vhs_studio",
                        "pipeline",
                        raw_path,
                        "--params-json",
                        params_json,
                    ]

                    success, _ = pm.start_process(cmd)
                    if success:
                        # Await process completion
                        while pm.is_running():
                            time.sleep(1)
                        self.manager.complete_job(job_id)
                    else:
                        self.manager.fail_job(job_id, "Failed starting subprocess.")
            time.sleep(2)


queue_worker = QueueWorker()


def enqueue_job(
    raw_path: str, params: Optional[Dict[str, Any]] = None, priority: int = 0
) -> int:
    """Enqueue a job into the global queue manager."""
    return queue_manager.enqueue(raw_path, params, priority)


def get_next_job() -> Optional[Dict[str, Any]]:
    """Fetch next pending job from the global queue manager."""
    return queue_manager.get_next_pending_job()


def complete_job(job_id: int) -> None:
    """Mark a job as completed in the global queue manager."""
    queue_manager.complete_job(job_id)


def fail_job(job_id: int, error_message: str) -> None:
    """Mark a job as failed in the global queue manager."""
    queue_manager.fail_job(job_id, error_message)
