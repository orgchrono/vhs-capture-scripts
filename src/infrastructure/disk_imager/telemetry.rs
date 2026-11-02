//! Real-Time Disk Imaging Telemetry Emitter (`disk_imager/telemetry.rs`).

use crate::domain::disk_imager::ImagingTelemetry;
use crate::infrastructure::app_context::AppContext;
use crate::models::constants::DISK_IMAGING_SSE_PREFIX;
use tauri::Emitter;

pub fn emit_imaging_telemetry(
    ctx: &AppContext,
    window: Option<&tauri::Window>,
    telemetry: &ImagingTelemetry,
) {
    if let Ok(json_str) = serde_json::to_string(telemetry) {
        ctx.process
            .append_log(format!("{DISK_IMAGING_SSE_PREFIX}{json_str}"));
    }
    if let Some(win) = window {
        let _ = win.emit("disk_imaging_progress", telemetry);
    }
}
