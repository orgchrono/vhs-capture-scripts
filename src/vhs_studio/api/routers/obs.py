"""OBS Studio integration router for telemetry, capture, and virtual cam control."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from vhs_studio.api.routers.schemas import ObsVirtualCamPayload

obs_router = APIRouter(prefix="/api/obs", tags=["OBS"])


def _resolve_obs_client():
    """Retrieve OBSClient class through server module to support runtime mocking and decoupling."""
    import vhs_studio.api.server as server
    return server.OBSClient()


@obs_router.get("/stats")
def get_obs_stats():
    """Return live telemetry from OBS Studio WebSocket API (bitrate, duration, fps, cpu)."""
    obs = _resolve_obs_client()
    if not obs.is_connected:
        obs.connect(max_retries=1, silent=True)
    if obs.is_connected:
        status = obs.send_request("GetRecordStatus") or {}
        stats = obs.send_request("GetStats") or {}
        return {
            "connected": True,
            "recording": status.get("outputActive", False),
            "timecode": status.get("outputTimecode", "00:00:00"),
            "duration_sec": round(status.get("outputDuration", 0) / 1000.0, 1),
            "bytes": status.get("outputBytes", 0),
            "bitrate_kbps": round(stats.get("outputBitrate", 0), 1),
            "fps": round(stats.get("activeFps", 0), 1),
            "cpu_usage": round(stats.get("cpuUsage", 0), 1),
            "memory_mb": round(stats.get("memoryUsage", 0), 1),
        }
    return {"connected": False, "recording": False}


@obs_router.post("/start")
def obs_start():
    """Trigger OBS Studio recording start."""
    obs = _resolve_obs_client()
    if not obs.is_connected:
        obs.connect()
    res = obs.start_record()
    if res and res.get("requestStatus", {}).get("result"):
        return {"status": "ok", "message": "Recording started."}
    return JSONResponse(status_code=500, content={"status": "error", "message": "Failed to start OBS recording."})


@obs_router.post("/stop")
def obs_stop():
    """Trigger OBS Studio recording stop."""
    obs = _resolve_obs_client()
    if not obs.is_connected:
        obs.connect()
    res = obs.stop_record() or {}
    output_path = res.get("responseData", {}).get("outputPath", "")
    return {"status": "ok", "message": "Recording stopped.", "path": output_path}


@obs_router.post("/virtualcam")
async def obs_virtualcam(payload: ObsVirtualCamPayload):
    """Toggle OBS Virtual Camera output."""
    obs = _resolve_obs_client()
    if not obs.is_connected:
        obs.connect()
    action = "StartVirtualCam" if payload.enable else "StopVirtualCam"
    obs.send_request(action)
    return {"status": "ok", "message": f"Virtual camera set to {payload.enable}."}
