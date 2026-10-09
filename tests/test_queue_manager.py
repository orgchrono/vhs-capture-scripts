"""Tests for persistent SQLite queue manager and sequential background worker."""

import os
import tempfile
import time
from vhs_studio.core.queue_manager import (
    PersistentQueueManager,
    QueueWorker,
    enqueue_job,
    get_next_job,
    complete_job,
    fail_job,
)


def test_queue_enqueue_and_get_next():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_queue.db")
        qm = PersistentQueueManager(db_path=db_path, max_concurrent=1)

        job1_id = qm.enqueue("media/tape_01.mkv", {"preset": "gold"}, priority=1)
        job2_id = qm.enqueue("media/tape_02.mkv", {"preset": "speed"}, priority=10)

        assert job1_id > 0
        assert job2_id > 0

        # Higher priority job should be retrieved first
        next_job = qm.get_next_pending_job()
        assert next_job is not None
        assert next_job["id"] == job2_id
        assert next_job["status"] == "processing"
        assert next_job["params"]["preset"] == "speed"

        # Next job in FIFO order
        next_job_2 = qm.get_next_pending_job()
        assert next_job_2 is not None
        assert next_job_2["id"] == job1_id

        # No more pending jobs
        assert qm.get_next_pending_job() is None


def test_queue_complete_fail_cancel():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_queue.db")
        qm = PersistentQueueManager(db_path=db_path)

        job_id = qm.enqueue("media/tape_01.mkv")
        stats = qm.get_stats()
        assert stats["pending"] == 1

        # Test cancel
        cancelled = qm.cancel_job(job_id)
        assert cancelled is True
        jobs = qm.list_jobs(status="cancelled")
        assert len(jobs) == 1
        assert jobs[0]["id"] == job_id

        # Cannot cancel non-pending
        assert qm.cancel_job(job_id) is False

        # Test complete and fail
        job2_id = qm.enqueue("media/tape_02.mkv")
        qm.complete_job(job2_id)
        completed = qm.list_jobs(status="completed")
        assert len(completed) == 1
        assert completed[0]["id"] == job2_id

        job3_id = qm.enqueue("media/tape_03.mkv")
        qm.fail_job(job3_id, "Corrupted video frame")
        failed = qm.list_jobs(status="failed")
        assert len(failed) == 1
        assert failed[0]["error_message"] == "Corrupted video frame"


def test_queue_worker_lifecycle():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_queue.db")
        qm = PersistentQueueManager(db_path=db_path)
        worker = QueueWorker(manager=qm)

        assert worker._running is False
        worker.start()
        assert worker._running is True
        time.sleep(0.1)
        worker.stop()
        assert worker._running is False


def test_top_level_queue_helpers():
    # Test top-level functions delegate without raising
    job_id = enqueue_job("media/synthetic_test.mkv", {"test": True})
    assert job_id > 0
    job = get_next_job()
    if job and job["id"] == job_id:
        complete_job(job_id)
        fail_job(job_id, "test failure message")
