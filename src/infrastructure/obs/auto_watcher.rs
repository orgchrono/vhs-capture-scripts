//! Background daemon thread for real-time OBS capture signal monitoring and auto-start/stop trigger.

use super::rpc_client::execute_obs_rpc_command;
use crate::domain::obs_signal::{
    analyze_visual_frame_rgb, base64_decode, evaluate_capture_trigger, CaptureTriggerDecision,
    RgbPixel,
};

/// Background daemon worker that continuously monitors OBS capture stream and triggers Auto-Start/Auto-Stop.
pub fn start_obs_auto_watcher(running_flag: std::sync::Arc<std::sync::atomic::AtomicBool>) {
    use std::sync::atomic::Ordering;
    if running_flag.swap(true, Ordering::SeqCst) {
        return; // Already running
    }
    let flag_clone = running_flag.clone();
    std::thread::Builder::new()
        .name("obs-auto-watcher".to_string())
        .spawn(move || {
            let mut active_sec = 0.0;
            let mut blank_sec = 0.0;
            let mut quiet_sec = 0.0;
            let poll_interval_sec = crate::models::constants::OBS_WATCHER_POLL_INTERVAL_MS as f64 / 1000.0;
            let mut prev_pixels: Option<Vec<RgbPixel>> = None;

            while flag_clone.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(crate::models::constants::OBS_WATCHER_POLL_INTERVAL_MS));
                if !flag_clone.load(Ordering::Relaxed) {
                    break;
                }

                let is_recording = match execute_obs_rpc_command("GetRecordStatus", None, None) {
                    Ok(resp) => resp.get("outputActive").and_then(serde_json::Value::as_bool).unwrap_or(false),
                    Err(_) => {
                        active_sec = 0.0;
                        blank_sec = 0.0;
                        quiet_sec = 0.0;
                        continue;
                    }
                };

                // Sample visual frame from OBS program scene
                let scene_name = execute_obs_rpc_command("GetCurrentProgramScene", None, None)
                    .ok()
                    .and_then(|r| r.get("currentProgramSceneName").and_then(serde_json::Value::as_str).map(|s| s.to_string()));

                let screenshot_params = scene_name.map(|name| {
                    serde_json::json!({
                        "sourceName": name,
                        "imageFormat": "bmp",
                        "imageWidth": crate::models::constants::OBS_WATCHER_THUMBNAIL_WIDTH_PX,
                        "imageHeight": crate::models::constants::OBS_WATCHER_THUMBNAIL_HEIGHT_PX,
                    })
                });

                let visual_analysis = if let Some(params) = screenshot_params {
                    execute_obs_rpc_command("GetSourceScreenshot", Some(params), None).ok().and_then(|resp| {
                        let img_str = resp.get("imageData").and_then(serde_json::Value::as_str)?;
                        let b64_str = if let Some(idx) = img_str.find(',') {
                            &img_str[idx + 1..]
                        } else {
                            img_str
                        };
                        let decoded = base64_decode(b64_str).ok()?;
                        if decoded.len() >= 54 && &decoded[0..2] == b"BM" {
                            let offset = u32::from_le_bytes([decoded[10], decoded[11], decoded[12], decoded[13]]) as usize;
                            let bpp = if decoded.len() >= 30 {
                                u16::from_le_bytes([decoded[28], decoded[29]])
                            } else {
                                24
                            };
                            if decoded.len() > offset {
                                let pixel_slice = &decoded[offset..];
                                let curr_pixels: Vec<RgbPixel> = if bpp == 32 {
                                    pixel_slice
                                        .chunks_exact(4)
                                        .take(192)
                                        .map(|c| RgbPixel { r: c[2], g: c[1], b: c[0] })
                                        .collect()
                                } else {
                                    pixel_slice
                                        .chunks_exact(3)
                                        .take(192)
                                        .map(|c| RgbPixel { r: c[2], g: c[1], b: c[0] })
                                        .collect()
                                };
                                let visual = analyze_visual_frame_rgb(&curr_pixels, prev_pixels.as_deref());
                                prev_pixels = Some(curr_pixels);
                                return visual;
                            }
                        } else if decoded.len() >= 60 {
                            let curr_pixels: Vec<RgbPixel> = decoded
                                .chunks_exact(3)
                                .take(192)
                                .map(|c| RgbPixel { r: c[0], g: c[1], b: c[2] })
                                .collect();
                            let visual = analyze_visual_frame_rgb(&curr_pixels, prev_pixels.as_deref());
                            prev_pixels = Some(curr_pixels);
                            return visual;
                        }
                        None
                    })
                } else {
                    None
                };

                let is_muted = execute_obs_rpc_command(
                    "GetInputMute",
                    Some(serde_json::json!({ "inputName": "Mic/Aux" })),
                    None,
                )
                .ok()
                .and_then(|r| r.get("inputMuted").and_then(serde_json::Value::as_bool))
                .unwrap_or(false);

                let has_audio = !is_muted && visual_analysis.as_ref().map(|v| !v.is_blank).unwrap_or(false);
                let visual_ref = visual_analysis.as_ref();
                let visual_is_active = visual_ref.map(|v| v.is_active).unwrap_or(false);
                let visual_is_blank = visual_ref.map(|v| v.is_blank).unwrap_or(true);

                // Update signal accumulators based on continuous state
                if !is_recording {
                    if has_audio || visual_is_active {
                        active_sec += poll_interval_sec;
                    } else {
                        active_sec = 0.0;
                    }
                    blank_sec = 0.0;
                    quiet_sec = 0.0;
                } else if !has_audio {
                    active_sec = 0.0;
                    if visual_is_blank {
                        blank_sec += poll_interval_sec;
                        quiet_sec = 0.0;
                    } else if visual_is_active {
                        quiet_sec += poll_interval_sec;
                        blank_sec = 0.0;
                    } else {
                        blank_sec = 0.0;
                        quiet_sec = 0.0;
                    }
                } else {
                    active_sec = 0.0;
                    blank_sec = 0.0;
                    quiet_sec = 0.0;
                }

                let decision = evaluate_capture_trigger(
                    is_recording,
                    has_audio,
                    visual_ref,
                    active_sec,
                    blank_sec,
                    quiet_sec,
                    crate::models::constants::OBS_WATCHER_START_CONFIRM_SEC,
                    crate::models::constants::OBS_WATCHER_STOP_BLANK_CONFIRM_SEC,
                    crate::models::constants::OBS_WATCHER_STOP_QUIET_SCENE_SEC,
                );

                match decision {
                    CaptureTriggerDecision::StartRecording => {
                        let _ = execute_obs_rpc_command("StartRecord", None, None);
                        active_sec = 0.0;
                    }
                    CaptureTriggerDecision::StopRecording => {
                        let _ = execute_obs_rpc_command("StopRecord", None, None);
                        blank_sec = 0.0;
                        quiet_sec = 0.0;
                    }
                    CaptureTriggerDecision::ContinueWaiting => {}
                    CaptureTriggerDecision::HoldRecording => {}
                }
            }
            flag_clone.store(false, Ordering::SeqCst);
        })
        .ok();
}

/// Signals the OBS auto-watcher daemon to terminate.
pub fn stop_obs_auto_watcher(running_flag: &std::sync::atomic::AtomicBool) {
    running_flag.store(false, std::sync::atomic::Ordering::SeqCst);
}
