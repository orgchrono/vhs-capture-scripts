"""Batch pipeline runner and persistent queue daemon."""

import time
import os
from typing import Optional
from vhs_studio.core.logger import log
from vhs_studio.core.queue_manager import JobDict, get_next_job, complete_job, fail_job
from vhs_studio.video.chapter_marker import generate_chapters
from vhs_studio.storage.manager import StorageManager
from vhs_studio.config.storage_config import load_storage_config


def process_job(job: JobDict) -> None:
    """Execute end-to-end processing and cloud sync for a queued job."""
    raw_path = job.get("raw_path", "")
    job_id = int(job.get("id", 0))

    if not os.path.exists(raw_path):
        fail_job(job_id, f"File not found: {raw_path}")
        return

    log.info(f"========== STARTING PIPELINE (Job #{job_id}) ==========")
    log.info(f"Source tape: {raw_path}")

    base_dir = os.path.dirname(raw_path)
    base_name = os.path.splitext(os.path.basename(raw_path))[0]

    restored_path = raw_path

    final_output_path = os.path.join(base_dir, f"{base_name}_final.mkv")
    success = generate_chapters(restored_path, final_output_path)

    if not success:
        log.warning(
            "[Pipeline] Chapter marking failed. Using source file for upload."
        )
        final_output_path = restored_path

    config = load_storage_config()
    provider_id = str(config.get("provider", "local_nas_usb"))

    if provider_id != "local_nas_usb":
        log.info(f"[Pipeline] Starting synchronization with {provider_id}...")
        try:
            provider = StorageManager.get_provider(provider_id)
            if provider:
                url = provider.upload_video(
                    final_output_path, os.path.basename(final_output_path)
                )
                log.info(f"[Pipeline] Upload completed! URL: {url}")
            else:
                log.error(f"[Pipeline] Provider {provider_id} not found.")
        except Exception as e:
            log.error(f"[Pipeline] Fatal upload error: {e}")
            fail_job(job_id, f"Upload failure: {e}")
            return

    complete_job(job_id)
    log.info(f"========== END OF PIPELINE (Job #{job_id}) ==========\n")


def pipeline_loop():
    """Run persistent polling daemon consuming queued rendering jobs."""
    log.info("[Pipeline Daemon] Starting capture queue monitoring...")
    while True:
        try:
            job = get_next_job()
            if job:
                process_job(job)
            else:
                time.sleep(5)
        except KeyboardInterrupt:
            log.info("[Pipeline Daemon] Loop terminated by user.")
            break
        except Exception as e:
            log.error(f"[Pipeline Daemon] Unexpected loop error: {e}")
            time.sleep(10)


if __name__ == "__main__":
    pipeline_loop()
