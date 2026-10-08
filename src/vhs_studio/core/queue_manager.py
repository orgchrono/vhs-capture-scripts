import sqlite3
import os
import json
from vhs_studio.core.logger import log

DB_PATH = os.path.join(os.path.expanduser("~"), ".vhs_studio", "pipeline.db")


def _get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_path TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
        )
    """)
    conn.commit()
    return conn


def enqueue_job(raw_path: str, metadata: dict | None = None):
    conn = _get_conn()
    meta_str = json.dumps(metadata) if metadata else "{}"
    conn.execute(
        "INSERT INTO jobs (raw_path, status, metadata) VALUES (?, 'pending', ?)",
        (raw_path, meta_str),
    )
    conn.commit()
    conn.close()
    log.info(f"[Fila] Fita adicionada à fila de processamento: {raw_path}")


def get_next_job():
    conn = _get_conn()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE status = 'pending' ORDER BY id ASC LIMIT 1")
    row = cursor.fetchone()
    if row:
        conn.execute(
            "UPDATE jobs SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (row["id"],),
        )
        conn.commit()
    conn.close()
    return dict(row) if row else None


def complete_job(job_id: int):
    conn = _get_conn()
    conn.execute(
        "UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (job_id,),
    )
    conn.commit()
    conn.close()


def fail_job(job_id: int, error_msg: str):
    conn = _get_conn()
    conn.execute(
        "UPDATE jobs SET status = 'failed', updated_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?",
        (json.dumps({"error": error_msg}), job_id),
    )
    conn.commit()
    conn.close()
