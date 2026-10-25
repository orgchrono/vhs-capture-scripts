//! Pure Functional OBS WebSocket v5 Protocol and Signal Quality Engine.
//!
//! Provides Base64 RFC 4648 codecs, challenge-response SHA-256 authentication,
//! RGB statistical frame analysis (blackout, blue screen, variance), and capture decision state machine.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const BASE64_ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Standard RFC 4648 Base64 encoder implemented in pure Rust without external dependencies.
#[must_use]
pub fn base64_encode(data: &[u8]) -> String {
    if data.is_empty() {
        return String::new();
    }

    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
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

/// Standard RFC 4648 Base64 decoder implemented in pure Rust without external dependencies.
pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let clean: Vec<u8> = input
        .bytes()
        .filter(|&b| !b.is_ascii_whitespace())
        .collect();
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    if clean.len() % 4 != 0 {
        return Err("Invalid Base64 length".to_string());
    }

    let decode_byte = |b: u8| -> Result<u8, String> {
        match b {
            b'A'..=b'Z' => Ok(b - b'A'),
            b'a'..=b'z' => Ok(b - b'a' + 26),
            b'0'..=b'9' => Ok(b - b'0' + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err(format!("Invalid Base64 character: {b}")),
        }
    };

    let mut out = Vec::with_capacity((clean.len() / 4) * 3);
    for chunk in clean.chunks_exact(4) {
        let pad_count = chunk.iter().filter(|&&b| b == b'=').count();
        if pad_count > 2 || (pad_count > 0 && chunk[3] != b'=') || (pad_count == 2 && chunk[2] != b'=') {
            return Err("Invalid Base64 padding".to_string());
        }

        let b0 = decode_byte(chunk[0])?;
        let b1 = decode_byte(chunk[1])?;
        let b2 = if chunk[2] == b'=' { 0 } else { decode_byte(chunk[2])? };
        let b3 = if chunk[3] == b'=' { 0 } else { decode_byte(chunk[3])? };

        let n = ((b0 as u32) << 18) | ((b1 as u32) << 12) | ((b2 as u32) << 6) | (b3 as u32);

        out.push(((n >> 16) & 0xFF) as u8);
        if chunk[2] != b'=' {
            out.push(((n >> 8) & 0xFF) as u8);
        }
        if chunk[3] != b'=' {
            out.push((n & 0xFF) as u8);
        }
    }

    Ok(out)
}

/// Pure functional computation of OBS WebSocket v5 SHA-256 challenge response.
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

    let is_black = r_avg < 25.0 && g_avg < 25.0 && b_avg < 25.0;
    let is_blue = b_avg > 90.0 && b_avg > (r_avg + g_avg) * 1.4;

    let variance = pixels.iter().fold(0.0, |acc, p| {
        let dr = p.r as f64 - r_avg;
        let dg = p.g as f64 - g_avg;
        let db = p.b as f64 - b_avg;
        acc + (dr * dr + dg * dg + db * db)
    }) / (n * 3.0);

    let is_solid = variance < 15.0;

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
#[allow(clippy::too_many_arguments)]
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
