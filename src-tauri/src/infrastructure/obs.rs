//! OBS Studio WebSocket v5 Protocol Engine.
//!
//! Pure functional challenge-response SHA-256 authentication, Base64 encoding,
//! and protocol frame formatting for OBS Studio v5 Remote Procedure Calls.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard RFC 4648 Base64 encoder implemented in pure Rust without external dependencies.
#[must_use]
pub fn base64_encode(data: &[u8]) -> String {
    if data.is_empty() {
        return String::new();
    }

    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        let n = (b0 << 16) | (b1 << 8) | b2;

        out.push(BASE64_ALPHABET[(n >> 18) & 63] as char);
        out.push(BASE64_ALPHABET[(n >> 12) & 63] as char);

        if chunk.len() > 1 {
            out.push(BASE64_ALPHABET[(n >> 6) & 63] as char);
        } else {
            out.push('=');
        }

        if chunk.len() > 2 {
            out.push(BASE64_ALPHABET[n & 63] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// Pure functional computation of OBS WebSocket v5 SHA-256 challenge response.
///
/// Formula:
/// 1. secret = base64(sha256(password + salt))
/// 2. auth_response = base64(sha256(secret + challenge))
#[must_use]
pub fn compute_obs_auth_response(password: &str, salt: &str, challenge: &str) -> String {
    let mut hasher1 = Sha256::new();
    hasher1.update(password.as_bytes());
    hasher1.update(salt.as_bytes());
    let secret_b64 = base64_encode(&hasher1.finalize());

    let mut hasher2 = Sha256::new();
    hasher2.update(secret_b64.as_bytes());
    hasher2.update(challenge.as_bytes());
    base64_encode(&hasher2.finalize())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ObsRecordStatus {
    pub is_recording: bool,
    pub is_paused: bool,
    pub timecode: String,
    pub duration_seconds: f64,
    pub bytes: u64,
}

/// Build OBS v5 Identify frame (Op 1).
#[must_use]
pub fn build_identify_payload(
    rpc_version: u32,
    event_subscriptions: u64,
    auth: Option<&str>,
) -> serde_json::Value {
    let mut d = serde_json::json!({
        "rpcVersion": rpc_version,
        "eventSubscriptions": event_subscriptions
    });

    if let Some(auth_str) = auth {
        d["authentication"] = serde_json::Value::String(auth_str.to_string());
    }

    serde_json::json!({
        "op": 1,
        "d": d
    })
}

/// Build OBS v5 Request frame (Op 6).
#[must_use]
pub fn build_request_payload(
    request_type: &str,
    request_id: &str,
    request_data: Option<serde_json::Value>,
) -> serde_json::Value {
    serde_json::json!({
        "op": 6,
        "d": {
            "requestType": request_type,
            "requestId": request_id,
            "requestData": request_data.unwrap_or_else(|| serde_json::json!({}))
        }
    })
}

/// Pure parser extracting recording status from OBS `GetRecordStatus` response frame.
#[must_use]
pub fn parse_record_status_response(response: &serde_json::Value) -> Option<ObsRecordStatus> {
    let data = response.get("d")?.get("responseData")?;
    let is_recording = data.get("outputActive")?.as_bool()?;
    let is_paused = data.get("outputPaused").and_then(|v| v.as_bool()).unwrap_or(false);
    let timecode = data.get("outputTimecode").and_then(|v| v.as_str()).unwrap_or("00:00:00").to_string();
    let duration_seconds = data.get("outputDuration").and_then(|v| v.as_f64()).unwrap_or(0.0) / 1000.0;
    let bytes = data.get("outputBytes").and_then(|v| v.as_u64()).unwrap_or(0);

    Some(ObsRecordStatus {
        is_recording,
        is_paused,
        timecode,
        duration_seconds,
        bytes,
    })
}

/// Convert linear amplitude multiplier (0.0 to 1.0) to decibels (dBFS).
#[must_use]
pub fn mul_to_db(mul: f64) -> f64 {
    if mul <= 0.000_001 {
        -100.0
    } else {
        20.0 * mul.log10()
    }
}

/// Convert decibels (dBFS) to linear amplitude multiplier.
#[must_use]
pub fn db_to_mul(db: f64) -> f64 {
    10.0f64.powf(db / 20.0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RgbPixel {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VisualFrameAnalysis {
    pub r_avg: f64,
    pub g_avg: f64,
    pub b_avg: f64,
    pub is_black: bool,
    pub is_blue: bool,
    pub is_solid: bool,
    pub is_blank: bool,
    pub is_active: bool,
    pub variance: f64,
    pub diff: f64,
}

/// Analyze raw RGB pixel buffer (e.g. 16x12 OBS preview thumbnail) using pure functional statistical metrics.
#[must_use]
pub fn analyze_visual_frame_rgb(
    pixels: &[RgbPixel],
    prev_pixels: Option<&[RgbPixel]>,
) -> Option<VisualFrameAnalysis> {
    if pixels.is_empty() {
        return None;
    }

    let n = pixels.len() as f64;
    let (r_sum, g_sum, b_sum) = pixels.iter().fold((0.0, 0.0, 0.0), |(r, g, b), p| {
        (r + p.r as f64, g + p.g as f64, b + p.b as f64)
    });

    let r_avg = r_sum / n;
    let g_avg = g_sum / n;
    let b_avg = b_sum / n;

    // Black screen detection: low signal floor
    let is_black = r_avg < 25.0 && g_avg < 25.0 && b_avg < 25.0;

    // Blue screen detection: tape deck standby / no-signal screen
    let is_blue = b_avg > 90.0 && b_avg > (r_avg + g_avg) * 1.4;

    // Color variance across frame
    let variance = pixels.iter().fold(0.0, |acc, p| {
        let dr = p.r as f64 - r_avg;
        let dg = p.g as f64 - g_avg;
        let db = p.b as f64 - b_avg;
        acc + (dr * dr + dg * dg + db * db)
    }) / (n * 3.0);

    let is_solid = variance < 15.0;

    // Difference between consecutive frames (motion / analog tape noise)
    let diff = if let Some(prev) = prev_pixels {
        if prev.len() == pixels.len() {
            pixels.iter().zip(prev.iter()).fold(0.0, |acc, (p1, p2)| {
                acc + (p1.r as f64 - p2.r as f64).abs()
                    + (p1.g as f64 - p2.g as f64).abs()
                    + (p1.b as f64 - p2.b as f64).abs()
            }) / (n * 3.0)
        } else {
            0.0
        }
    } else {
        0.0
    };

    let is_blank = is_black || is_blue || (is_solid && (r_avg < 35.0 || b_avg > 80.0));
    let is_active = !is_blank && (variance >= 20.0 || diff >= 2.0);

    Some(VisualFrameAnalysis {
        r_avg,
        g_avg,
        b_avg,
        is_black,
        is_blue,
        is_solid,
        is_blank,
        is_active,
        variance,
        diff,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CaptureTriggerDecision {
    StartRecording,
    StopRecording,
    ContinueWaiting,
    HoldRecording,
}

/// Pure functional evaluation of intelligent capture triggers (immediate start / auto-stop with scene protection).
#[must_use]
pub fn evaluate_capture_trigger(
    is_recording: bool,
    has_audio: bool,
    visual: Option<&VisualFrameAnalysis>,
    active_duration_sec: f64,
    blank_silence_duration_sec: f64,
    quiet_scene_duration_sec: f64,
    start_confirm_sec: f64,
    stop_blank_confirm_sec: f64,
    stop_quiet_scene_sec: f64,
) -> CaptureTriggerDecision {
    let visual_is_active = visual.map(|v| v.is_active).unwrap_or(false);
    let visual_is_blank = visual.map(|v| v.is_blank).unwrap_or(true);

    if !is_recording {
        if (has_audio || visual_is_active) && active_duration_sec >= start_confirm_sec {
            CaptureTriggerDecision::StartRecording
        } else {
            CaptureTriggerDecision::ContinueWaiting
        }
    } else if !has_audio {
        if visual_is_blank {
            if blank_silence_duration_sec >= stop_blank_confirm_sec {
                CaptureTriggerDecision::StopRecording
            } else {
                CaptureTriggerDecision::HoldRecording
            }
        } else if visual_is_active {
            // Scene protection: quiet dialogue or silent film with moving video
            if quiet_scene_duration_sec >= stop_quiet_scene_sec {
                CaptureTriggerDecision::StopRecording
            } else {
                CaptureTriggerDecision::HoldRecording
            }
        } else {
            CaptureTriggerDecision::HoldRecording
        }
    } else {
        CaptureTriggerDecision::HoldRecording
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn test_compute_obs_auth_response_deterministic() {
        let auth = compute_obs_auth_response("supersecret", "salt123", "challenge456");
        assert!(!auth.is_empty());
        // Verify deterministic idempotency
        assert_eq!(auth, compute_obs_auth_response("supersecret", "salt123", "challenge456"));
    }

    #[test]
    fn test_build_identify_payload() {
        let payload = build_identify_payload(1, 33, Some("auth_token_xyz"));
        assert_eq!(payload["op"], 1);
        assert_eq!(payload["d"]["rpcVersion"], 1);
        assert_eq!(payload["d"]["eventSubscriptions"], 33);
        assert_eq!(payload["d"]["authentication"], "auth_token_xyz");
    }

    #[test]
    fn test_build_request_payload() {
        let req = build_request_payload("StartRecord", "req_100", None);
        assert_eq!(req["op"], 6);
        assert_eq!(req["d"]["requestType"], "StartRecord");
        assert_eq!(req["d"]["requestId"], "req_100");
    }

    #[test]
    fn test_parse_record_status_response() {
        let resp = serde_json::json!({
            "op": 7,
            "d": {
                "requestType": "GetRecordStatus",
                "requestId": "req_100",
                "requestStatus": { "result": true, "code": 100 },
                "responseData": {
                    "outputActive": true,
                    "outputPaused": false,
                    "outputTimecode": "00:01:45",
                    "outputDuration": 105000.0,
                    "outputBytes": 2048576
                }
            }
        });

        let status = parse_record_status_response(&resp).expect("Valid record status");
        assert!(status.is_recording);
        assert!(!status.is_paused);
        assert_eq!(status.timecode, "00:01:45");
        assert_eq!(status.duration_seconds, 105.0);
        assert_eq!(status.bytes, 2048576);
    }

    #[test]
    fn test_mul_and_db_conversions() {
        assert_eq!(mul_to_db(0.0), -100.0);
        assert!((mul_to_db(1.0) - 0.0).abs() < 0.001);
        let db_minus_50 = mul_to_db(0.00316227766);
        assert!((db_minus_50 - -50.0).abs() < 0.01);
        let mul_reconstructed = db_to_mul(-50.0);
        assert!((mul_reconstructed - 0.00316227766).abs() < 0.0001);
    }

    #[test]
    fn test_analyze_visual_frame_rgb_black_and_blue_and_active() {
        // Black screen
        let black_pixels = vec![RgbPixel { r: 10, g: 10, b: 10 }; 192];
        let analysis_black = analyze_visual_frame_rgb(&black_pixels, None).expect("Analysis failed");
        assert!(analysis_black.is_black);
        assert!(analysis_black.is_blank);
        assert!(!analysis_black.is_active);

        // Blue screen (e.g. tape deck stop / no signal screen)
        let blue_pixels = vec![RgbPixel { r: 10, g: 10, b: 200 }; 192];
        let analysis_blue = analyze_visual_frame_rgb(&blue_pixels, None).expect("Analysis failed");
        assert!(analysis_blue.is_blue);
        assert!(analysis_blue.is_blank);
        assert!(!analysis_blue.is_active);

        // Active video frame with texture/detail
        let mut active_pixels = Vec::with_capacity(192);
        for i in 0..192 {
            active_pixels.push(RgbPixel {
                r: ((i * 17) % 200 + 40) as u8,
                g: ((i * 31) % 200 + 40) as u8,
                b: ((i * 47) % 200 + 40) as u8,
            });
        }
        let analysis_active = analyze_visual_frame_rgb(&active_pixels, None).expect("Analysis failed");
        assert!(!analysis_active.is_blank);
        assert!(analysis_active.is_active);
        assert!(analysis_active.variance >= 20.0);
    }

    #[test]
    fn test_evaluate_capture_trigger_decisions() {
        let active_visual = VisualFrameAnalysis {
            r_avg: 120.0,
            g_avg: 120.0,
            b_avg: 120.0,
            is_black: false,
            is_blue: false,
            is_solid: false,
            is_blank: false,
            is_active: true,
            variance: 45.0,
            diff: 5.0,
        };

        let blank_visual = VisualFrameAnalysis {
            r_avg: 10.0,
            g_avg: 10.0,
            b_avg: 210.0,
            is_black: false,
            is_blue: true,
            is_solid: true,
            is_blank: true,
            is_active: false,
            variance: 2.0,
            diff: 0.0,
        };

        // 1. Not recording yet -> Active signal for 150ms (> 100ms) -> Start
        let decision1 = evaluate_capture_trigger(
            false,
            true, // has audio
            Some(&active_visual),
            0.15, // active for 150ms
            0.0,
            0.0,
            0.10, // start threshold
            3.5,
            25.0,
        );
        assert_eq!(decision1, CaptureTriggerDecision::StartRecording);

        // 2. Not recording yet -> Active signal for only 50ms (< 100ms) -> Continue waiting
        let decision2 = evaluate_capture_trigger(
            false,
            true,
            Some(&active_visual),
            0.05,
            0.0,
            0.0,
            0.10,
            3.5,
            25.0,
        );
        assert_eq!(decision2, CaptureTriggerDecision::ContinueWaiting);

        // 3. Recording in progress -> Tape ends (silence + blue screen for 4.0s > 3.5s) -> Stop
        let decision3 = evaluate_capture_trigger(
            true,
            false, // silence
            Some(&blank_visual),
            0.0,
            4.0, // blank silence for 4 seconds
            0.0,
            0.10,
            3.5,
            25.0,
        );
        assert_eq!(decision3, CaptureTriggerDecision::StopRecording);

        // 4. Recording in progress -> Scene protection: Silent scene with moving video for 10s (< 25s) -> Hold
        let decision4 = evaluate_capture_trigger(
            true,
            false, // silent scene
            Some(&active_visual), // moving video!
            0.0,
            0.0,
            10.0, // quiet scene for 10s
            0.10,
            3.5,
            25.0,
        );
        assert_eq!(decision4, CaptureTriggerDecision::HoldRecording);
    }
}

