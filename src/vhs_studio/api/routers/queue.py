"""Queue router managing persistent batch processing workflows."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from vhs_studio.core.queue_manager import queue_manager, queue_worker
from vhs_studio.api.routers.security import is_safe_media_path
from vhs_studio.api.routers.schemas import QueueEnqueuePayload

queue_router = APIRouter(prefix="/api/queue", tags=["Queue"])


@queue_router.get("")
def get_queue():
    """Return queued jobs and status statistics."""
    return {
        "jobs": queue_manager.list_jobs(),
        "stats": queue_manager.get_stats(),
        "worker_running": queue_worker._running,
    }


@queue_router.post("/enqueue")
async def enqueue_queue_job(payload: QueueEnqueuePayload):
    """Enqueue a job into the persistent batch processing queue."""
    raw_path = payload.input
    params = payload.params
    priority = payload.priority

    if not is_safe_media_path(raw_path):
        return JSONResponse(
            status_code=400, content={"error": "Invalid or insecure file path."}
        )

    job_id = queue_manager.enqueue(raw_path, params, priority)
    return {"status": "ok", "job_id": job_id, "message": f"Job #{job_id} enqueued."}


@queue_router.post("/cancel/{job_id}")
def cancel_queue_job(job_id: int):
    """Cancel a pending job in the queue."""
    if queue_manager.cancel_job(job_id):
        return {"status": "ok", "message": f"Job #{job_id} cancelled."}
    return JSONResponse(status_code=400, content={"error": "Job could not be cancelled."})


@queue_router.post("/start")
def start_queue_worker():
    """Start the background sequential batch worker."""
    queue_worker.start()
    return {"status": "ok", "message": "Queue worker started."}


@queue_router.post("/stop")
def stop_queue_worker():
    """Pause the background sequential batch worker."""
    queue_worker.stop()
    return {"status": "ok", "message": "Queue worker stopped."}
