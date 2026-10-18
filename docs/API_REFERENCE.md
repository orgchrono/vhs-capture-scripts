# 🔌 REST & SSE API Reference - VHS Studio Pro

The VHS Studio Pro backend exposes a high-throughput RESTful API combined with Server-Sent Events (SSE) for low-latency communication with the desktop frontend and automated integration pipelines.

By default, the API service listens at:
`http://127.0.0.1:8088`

---

## 1. Security & Authentication Architecture

### 1.1 Origin & Host Header Validation
All inbound requests targeted at `/api/*` pass through the security middleware in [`src/infrastructure/http_server.rs`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/infrastructure/http_server.rs):
- The `Host` header must start with `127.0.0.1`, `localhost`, or `testserver`.
- Mutating HTTP methods (`POST`, `PUT`, `DELETE`) validate the origin against allowed loopback addresses.
- Policy violations return `HTTP 403 Forbidden` (`{"error": "Access denied."}` or `{"error": "Invalid origin."}`).

### 1.2 Session Token (Localhost CSRF Mitigation)
On every backend initialization, a unique 32-character hexadecimal cryptographic session secret is generated (`SESSION_TOKEN` via `secrets.token_hex(16)`).
- **Endpoint:** `GET /api/token`
- **Required Header on POST/Mutations:** `X-Session-Token: <token>`
- Mutating requests with missing or invalid tokens return `HTTP 403 Forbidden` (`{"error": "Invalid session token."}`).

### 1.3 Safe Media Path Validation (CWE-22)
Every endpoint accepting filesystem paths for media processing or queueing (`/api/run`, `/api/action`, `/api/queue/enqueue`) invokes [`is_safe_media_path`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/infrastructure/http_server.rs):
- Rejects null bytes (`\0`), path traversal sequences (`..`), and absolute paths resolving outside authorized directories (`MEDIA_DIR`).
- Traversal attempts are rejected with `HTTP 400 Bad Request` (`{"status": "error", "message": "Invalid or insecure file path."}`).

---

## 2. System Endpoints (`src/infrastructure/http_server.rs` & `src/viewmodels/system_vm.rs`)

### `GET /api/token`
Returns the active CSRF session token required for mutating requests.

- **Response (HTTP 200):**
  ```json
  {
    "token": "8a3e7b1c4d9f0e2a5c6b8d7e1f3a5c7b"
  }
  ```

---

### `GET /api/status`
Returns health metrics, detected hardware encoders, VapourSynth availability, OBS connection state, detected raw media files, and active process execution logs.

- **Response (HTTP 200):**
  ```json
  {
    "encoder": "h264_nvenc",
    "vapoursynth_available": true,
    "obs_connected": true,
    "raw_files": [
      {
        "name": "tape_01.mkv",
        "path": "C:\\...\\media\\raw\\tape_01.mkv",
        "size_mb": 4250.4
      }
    ],
    "process_running": false,
    "process_logs": [],
    "hardware": {
      "tier": 2,
      "tier_name": "Multi-Core CPU + iGPU Vulkan",
      "tier_color": "amber",
      "recommendation": "Ideal for restoration with BWDIF/Lanczos (~60-120 fps)...",
      "cpu": { "cores": 12, "arch": "AMD64", "model": "AMD Ryzen 5" },
      "ram": { "total_gb": 16.0, "available_gb": 10.2 },
      "gpu": { "type": "dedicated", "name": "NVIDIA GeForce RTX 3060", "vulkan_available": true, "vram_gb": 12.0 },
      "ai_capabilities": {
        "audio_deepfilter": { "name": "Neural Audio Restoration", "supported": true, "badge": "⚡ Real-Time (CPU)", "cost": "low", "desc": "..." }
      }
    }
  }
  ```

---

### `GET /api/hardware`
Executes deep host hardware diagnostics via the HAL, classifying host capability into Tiers 1 through 4 and enumerating supported neural modules.

- **Response (HTTP 200):**
  ```json
  {
    "tier": 4,
    "tier_name": "Workstation IA (High-End Dedicated GPU)",
    "tier_color": "emerald",
    "recommendation": "Dedicated GPU with high VRAM detected. All AI models supported at peak speed.",
    "cpu": { "cores": 16, "arch": "AMD64", "model": "AMD Ryzen 9" },
    "ram": { "total_gb": 32.0, "available_gb": 24.5 },
    "gpu": { "type": "dedicated", "name": "NVIDIA GeForce RTX 4080", "vulkan_available": true, "vram_gb": 16.0 },
    "ai_capabilities": {
      "rife_60fps": { "name": "RIFE Motion Interpolation (60fps)", "supported": true, "badge": "⚡ Fast (Vulkan)", "cost": "medium", "desc": "..." }
    }
  }
  ```

---

### `GET /api/system/metrics`
Returns non-blocking, real-time host hardware resource utilization and pipeline operational status via `psutil`.

- **Response (HTTP 200):**
  ```json
  {
    "cpu_percent": 18.4,
    "ram_used_gb": 7.25,
    "ram_total_gb": 31.92,
    "ram_percent": 22.7,
    "process_running": true,
    "is_paused": false
  }
  ```
- **Fields:**
  - `cpu_percent` (`float`): Instantaneous CPU utilization percentage (`0.0`–`100.0`).
  - `ram_used_gb` (`float`): Physical RAM currently consumed in gigabytes.
  - `ram_total_gb` (`float`): Total physical RAM installed on the host in gigabytes.
  - `ram_percent` (`float`): Memory pressure percentage (`0.0`–`100.0`).
  - `process_running` (`bool`): `true` if a restoration job is actively executing.
  - `is_paused` (`bool`): `true` if the active job process tree has been suspended.

---

### `GET /api/logs`
Returns cumulative in-memory execution logs tracked by the `ProcessManager`.

- **Response (HTTP 200):**
  ```json
  {
    "active": false,
    "logs": [
      "[RESTORATION] Pipeline initialization complete.",
      "[FFMPEG] frame=  120 fps= 59.9 q=18.0 size=   14336kB time=00:00:02.00 bitrate=58600.0kbits/s"
    ]
  }
  ```

---

### `GET /api/logs/stream`
Server-Sent Events (SSE) streaming endpoint with `text/event-stream` MIME type. Emits log lines generated by active worker subprocesses in real time (< 200ms latency).

- **Stream Output Format:**
  ```text
  data: {"connected": true, "active": true}

  data: {"line": "[FFMPEG] frame= 3120 fps= 59.9 q=18.0 ...", "active": true}

  data: {"active": false}
  ```

---

## 3. Persistent Batch Queue (`src/viewmodels/queue.rs` & `src/infrastructure/database.rs`)

### `GET /api/queue`
Retrieves all pending, processing, and completed jobs from the persistent SQLite queue.

- **Response (HTTP 200):**
  ```json
  {
    "jobs": [
      {
        "id": 1,
        "raw_path": "media/raw/tape_01.mkv",
        "params": { "deinterlacer": "bwdif" },
        "status": "pending",
        "priority": 5,
        "created_at": "2026-10-09 20:00:00"
      }
    ],
    "stats": { "total": 1, "pending": 1, "processing": 0, "completed": 0, "failed": 0 },
    "worker_running": false
  }
  ```

---

### `POST /api/queue/enqueue`
Adds a new media file to the sequential processing queue.

- **Payload Schema (`QueueEnqueuePayload`):**
  ```json
  {
    "input": "media/raw/tape_01.mkv",
    "params": {
      "deinterlacer": "qtgmc",
      "crf": 18,
      "audio_mode": "stereo"
    },
    "priority": 5
  }
  ```

---

### `POST /api/queue/cancel/{id}`
Cancels a queued or currently executing job by identifier.

- **Response (HTTP 200):**
  ```json
  {
    "status": "ok",
    "message": "Job 1 cancelled successfully."
  }
  ```

---

### `POST /api/queue/start` & `POST /api/queue/stop`
Starts or pauses the background queue worker thread.

---

## 4. OBS Studio Ingest & Telemetry (`src/viewmodels/obs.rs` & `src/infrastructure/obs.rs`)

### `GET /api/obs/stats`
Queries real-time telemetry from OBS Studio via WebSocket v5.

- **Response (HTTP 200):**
  ```json
  {
    "connected": true,
    "recording": true,
    "recording_time": "00:45:12",
    "cpu_usage": 3.8,
    "memory_usage": 420.5,
    "fps": 29.97,
    "output_bytes": 1425890012,
    "dropped_frames": 0
  }
  ```

---

### `POST /api/obs/start` & `POST /api/obs/stop`
Remotely triggers recording start and stop within OBS Studio.

---

## 5. Restoration & Process Actions (`src/viewmodels/restoration.rs` & `src/domain/pipeline.rs`)

### `POST /api/run`
Initiates direct pipeline execution for a selected media file.

- **Payload:**
  ```json
  {
    "input": "media/raw/tape_01.mkv",
    "preset": "gold",
    "deinterlacer": "qtgmc",
    "crf": 18,
    "ai_upscaler": false,
    "ai_face_restore": false,
    "ai_rife_60fps": false
  }
  ```

---

### `POST /api/action`
Dispatches process management commands (`pause_process`, `resume_process`, `abort_process`).

- **Payload Schema (`ActionPayload`):**
  ```json
  {
    "action": "pause_process"
  }
  ```

---

### `GET /api/monitor/comparison-frame`
Extracts and returns a comparison frame pair (Raw vs Restored) at a specified timestamp, encoded as base64 JPEG images.

- **Query Parameters:**
  - `source`: Relative path to raw file in `media/raw/`.
  - `timestamp`: Float timestamp in seconds (e.g. `12.5`).
  - `denoise`: Optional boolean (`true`/`false`) to simulate spatial-temporal noise reduction.
  - `color`: Optional boolean (`true`/`false`) to simulate color channel balancing.
- **Aspect Ratio Handling:** Uses resolution and scaling filters in [`src/domain/pipeline.rs`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/domain/pipeline.rs) to pad 4:3 SD tapes with pillarbox bars (`480x360` inside `640x360`), preventing anamorphic stretch.
- **Response (HTTP 200):**
  ```json
  {
    "raw_frame": "data:image/jpeg;base64,...",
    "processed_frame": "data:image/jpeg;base64,...",
    "timestamp": 12.5
  }
  ```

---

### `GET /api/monitor/stream-proxy`
Returns a continuous, low-latency live MJPEG stream (`multipart/x-mixed-replace`) for real-time split-screen comparison or timeline scrubbing.

- **Query Parameters:**
  - `source`: Path to target video file.
  - `timestamp`: Seek position in seconds (e.g. `0.0`).
  - `fps`: Stream delivery framerate between `1` and `60` (default: `15`).
  - `mode`: `"raw"`, `"processed"`, or `"split"` (dual-channel side-by-side comparison).
  - `denoise`: Boolean flag enabling live preview denoising (`hqdn3d`).
  - `color`: Boolean flag enabling live preview color matrix calibration.
- **Aspect Ratio & Subprocess Protection:**
  - Standard 4:3 VHS tapes receive automatic pillarbox scaling to fit the 16:9 monitor viewport without distortion.
  - On client disconnect (modal close or timeline seek), [`kill_process_tree`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/infrastructure/process_tree.rs) traverses the OS process tree and forcefully terminates all child FFmpeg processes, preventing background process leaks on Windows.

---

### `GET /api/restoration/incomplete`
Scans `media/restored/` for incomplete jobs (`.tmp.mp4`, `.tmp.mkv`) left after system reboots.

---

### `POST /api/restoration/incomplete/action`
Performs recovery actions (`resume`, `finalize`, or `discard`) on incomplete recordings.

---

## 6. Panasonic DVR Ingestion (`src/viewmodels/ingest.rs` & `src/infrastructure/panasonic.rs`)

### `GET /api/ingest/panasonic/disks`
Enumerates attached physical block drives and USB-SATA bridge controllers.

- **Response (HTTP 200):**
  ```json
  [
    {
      "device_path": "\\\\.\\PhysicalDrive1",
      "model": "JMicron Generic USB Device",
      "size_gb": 160.0,
      "is_usb": true,
      "is_jmicron": true,
      "is_asmedia": false
    }
  ]
  ```

---

### `GET /api/ingest/panasonic/tree`
Traverses MEIHDFS or DVD-VR partitions, returning the hierarchy of titles, chapters, duration, and metadata.

- **Query Parameters:**
  - `disk_path`: Target physical drive or disk image file path.

---

### `POST /api/ingest/panasonic/extract-titles`
Extracts selected program titles via native C utilities into `media/raw/`.

- **Payload Schema (`PanasonicExtractTitlesPayload`):**
  ```json
  {
    "disk_path": "\\\\.\\PhysicalDrive1",
    "title_indices": [0, 1],
    "output_dir": "media/raw"
  }
  ```

---

## 7. Media & Storage Endpoints (`src/viewmodels/media.rs` & `src/infrastructure/storage/`)

### `GET /api/media/thumbnail`
Generates and caches JPEG thumbnail representations for video files at specified positions.

- **Query Parameters:**
  - `path`: Safe path to media file.
  - `time`: Timestamp in seconds (default: `5.0`).

---

### `GET /api/storage/config` & `POST /api/storage/config`
Retrieves and updates archival destination parameters (Local Storage, AWS S3, Google Drive, Dropbox).

---

## 8. Quality Control & Analog Defect Diagnostics (`src/domain/qc.rs`)

The [`QualityControl`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/domain/qc.rs) subsystem exposes native Rust and CLI methods to inspect any tape media file, catalog its physical artifacts, and produce structured reports:

### `GET /api/restoration/qc-report`
Retrieves (or optionally generates on demand) the synchronized museum-grade JSON and Markdown defect & restoration report for a media file.

- **Query Parameters:**
  - `file_path`: Path to the raw or restored media file.
  - `generate`: Boolean (`true`/`false`) to trigger `QualityControl.run_qc` if the report does not yet exist on disk.

### Programmatic & CLI Invocation:
```rust
use vhs_studio::domain::qc::QualityControl;

# Standalone inspection
let json_path = QualityControl::run_qc("media/raw/tape_01.mkv")?;
```

```bash
cargo run -- qc-report media/raw/tape_01.mkv
# or with compiled binary:
vhs-studio qc-report media/raw/tape_01.mkv
```

### Generated Files:
- `<filepath>_qc_report.json`: JSON document containing raw metadata, black leader seconds, `idet` counts, audio decibel levels, `signalstats` dropouts, `pipeline_tools_registry`, `defect_events_log`, `cumulative_telemetry`, and `sync_state`.
- `<filepath>_defect_report.md`: 8-section Markdown document formatting the complete forensic defect matrix, per-tool correction registry, chronological frame-accurate defect log, and checkpoint synchronization state.
