"""Pytest hermetic test harness configuration and global fixtures.

Ensures tests never pollute the user's local directory (~/.vhs_studio)
or production database by providing isolated temporary directories.
"""

import os
import tempfile
import pytest
from typing import Generator


@pytest.fixture(autouse=True)
def isolate_vhs_studio_environment(tmp_path: pytest.TempPathFactory) -> Generator[None, None, None]:
    """Isolate VHS Studio configuration directory and SQLite queue database during tests."""
    temp_dir = str(tmp_path / ".vhs_studio")
    os.makedirs(temp_dir, exist_ok=True)
    temp_queue_db = os.path.join(temp_dir, "pipeline_queue.db")

    old_studio_dir = os.environ.get("VHS_STUDIO_DIR")
    old_queue_db = os.environ.get("VHS_STUDIO_QUEUE_DB")

    os.environ["VHS_STUDIO_DIR"] = temp_dir
    os.environ["VHS_STUDIO_QUEUE_DB"] = temp_queue_db

    # Re-initialize shared queue manager instance to point to the isolated temp database
    from vhs_studio.core import queue_manager, paths
    paths.VHS_STUDIO_DIR = temp_dir
    paths.STORAGE_CONFIG_PATH = os.path.join(temp_dir, "storage.json")
    paths.PREFERENCES_CONFIG_PATH = os.path.join(temp_dir, "preferences.json")

    isolated_qm = queue_manager.PersistentQueueManager(db_path=temp_queue_db)
    queue_manager.queue_manager = isolated_qm
    queue_manager.queue_worker.manager = isolated_qm

    yield

    if old_studio_dir is not None:
        os.environ["VHS_STUDIO_DIR"] = old_studio_dir
    else:
        os.environ.pop("VHS_STUDIO_DIR", None)

    if old_queue_db is not None:
        os.environ["VHS_STUDIO_QUEUE_DB"] = old_queue_db
    else:
        os.environ.pop("VHS_STUDIO_QUEUE_DB", None)
