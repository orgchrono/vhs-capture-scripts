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

/// Spawns the local OBS Studio process in background / minimized to tray (optionally with `--startvirtualcam`).
pub fn launch_obs(start_virtualcam: bool) -> Result<(), String> {
    let obs_bin = crate::infrastructure::toolchain::resolve_executable_path("obs", None, None)
        .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("obs64", None, None))
        .ok_or_else(|| "OBS Studio binary not found on host.".to_string())?;

    let mut cmd = std::process::Command::new(&obs_bin);
    cmd.arg("--minimize-to-tray");
    if start_virtualcam {
        cmd.arg("--startvirtualcam");
    }
    if let Some(parent) = obs_bin.parent() {
        cmd.current_dir(parent);
    }
    cmd.spawn().map_err(|e| format!("Failed to spawn OBS Studio: {e}"))?;
    Ok(())
}

/// Encodes a client-to-server text frame with RFC 6455 4-byte masking.
#[must_use]
pub fn encode_ws_client_text_frame(payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(payload.len() + 10);
    frame.push(0x81); // FIN + Text opcode
    let len = payload.len();
    if len <= 125 {
        frame.push(0x80 | (len as u8));
    } else if len <= 65535 {
        frame.push(0x80 | 126);
        frame.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        frame.push(0x80 | 127);
        frame.extend_from_slice(&(len as u64).to_be_bytes());
    }
    let mask = [0x56, 0x48, 0x53, 0x50]; // "VHSP" mask
    frame.extend_from_slice(&mask);
    for (i, &b) in payload.iter().enumerate() {
        frame.push(b ^ mask[i % 4]);
    }
    frame
}

/// Reads and unmasks a server-to-client frame per RFC 6455.
pub fn read_ws_server_frame<R: std::io::Read>(reader: &mut R) -> Result<Vec<u8>, String> {
    loop {
        let mut header = [0u8; 2];
        reader.read_exact(&mut header).map_err(|e| e.to_string())?;
        let opcode = header[0] & 0x0F;
        let masked = (header[1] & 0x80) != 0;
        let mut len = (header[1] & 0x7F) as usize;

        if len == 126 {
            let mut ext = [0u8; 2];
            reader.read_exact(&mut ext).map_err(|e| e.to_string())?;
            len = u16::from_be_bytes(ext) as usize;
        } else if len == 127 {
            let mut ext = [0u8; 8];
            reader.read_exact(&mut ext).map_err(|e| e.to_string())?;
            len = u64::from_be_bytes(ext) as usize;
        }

        let mask = if masked {
            let mut m = [0u8; 4];
            reader.read_exact(&mut m).map_err(|e| e.to_string())?;
            Some(m)
        } else {
            None
        };

        let mut payload = vec![0u8; len];
        reader.read_exact(&mut payload).map_err(|e| e.to_string())?;

        if let Some(m) = mask {
            for (i, b) in payload.iter_mut().enumerate() {
                *b ^= m[i % 4];
            }
        }

        match opcode {
            0x1 | 0x2 => return Ok(payload),
            0x8 => return Err("WebSocket connection closed by server".to_string()),
            0x9 | 0xA => {
                // Ignore Ping or Pong control frames and read next data frame
                continue;
            }
            _ => continue,
        }
    }
}

/// Real-time client executing an OBS Studio WebSocket v5 RPC call.
/// Connects on port 4455, completes RFC 6455 handshake, authenticates via challenge-response,
/// sends the request frame, and returns the response payload.
pub fn execute_obs_rpc_command(
    request_type: &str,
    request_data: Option<serde_json::Value>,
    password: Option<&str>,
) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let addr: SocketAddr = "127.0.0.1:4455"
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(300))
        .map_err(|e| format!("Could not connect to OBS WebSocket on port 4455: {e}"))?;

    stream
        .set_read_timeout(Some(Duration::from_millis(1500)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_millis(1500)))
        .map_err(|e| e.to_string())?;

    // 1. Handshake
    let handshake = concat!(
        "GET / HTTP/1.1\r\n",
        "Host: 127.0.0.1:4455\r\n",
        "Upgrade: websocket\r\n",
        "Connection: Upgrade\r\n",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n",
        "Sec-WebSocket-Version: 13\r\n\r\n"
    );
    stream
        .write_all(handshake.as_bytes())
        .map_err(|e| format!("Failed to send WebSocket handshake: {e}"))?;

    let mut header_buf = Vec::new();
    let mut byte = [0u8; 1];
    while stream.read_exact(&mut byte).is_ok() {
        header_buf.push(byte[0]);
        if header_buf.ends_with(b"\r\n\r\n") {
            break;
        }
        if header_buf.len() > 4096 {
            return Err("HTTP header too long".to_string());
        }
    }
    let header_str = String::from_utf8_lossy(&header_buf);
    if !header_str.contains("101") {
        return Err(format!("OBS handshake rejected: {header_str}"));
    }

    // 2. Read Op 0 (Hello)
    let hello_bytes = read_ws_server_frame(&mut stream)?;
    let hello: serde_json::Value = serde_json::from_slice(&hello_bytes)
        .map_err(|e| format!("Invalid Hello JSON from OBS: {e}"))?;

    let rpc_version = hello
        .get("d")
        .and_then(|d| d.get("rpcVersion"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(1) as u32;

    let auth_str = if let Some(auth_obj) = hello.get("d").and_then(|d| d.get("authentication")) {
        let challenge = auth_obj
            .get("challenge")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let salt = auth_obj
            .get("salt")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let pass = password.unwrap_or("");
        Some(compute_obs_auth_response(pass, salt, challenge))
    } else {
        None
    };

    // 3. Send Op 1 (Identify)
    let identify = build_identify_payload(rpc_version, 0, auth_str.as_deref());
    let identify_bytes = serde_json::to_vec(&identify).map_err(|e| e.to_string())?;
    stream
        .write_all(&encode_ws_client_text_frame(&identify_bytes))
        .map_err(|e| format!("Failed to send Identify frame: {e}"))?;

    // Read Op 2 (Identified)
    loop {
        let identified_bytes = read_ws_server_frame(&mut stream)?;
        let identified: serde_json::Value = serde_json::from_slice(&identified_bytes)
            .map_err(|e| format!("Invalid Identified JSON from OBS: {e}"))?;
        let op = identified
            .get("op")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        if op == 2 {
            break;
        } else if op == 5 {
            // Discard asynchronous OBS event received during handshake
            continue;
        } else {
            return Err(format!("OBS authentication failed: {identified}"));
        }
    }

    // 4. Send Op 6 (Request)
    let req_id = format!("req_{}", std::process::id());
    let req_payload = build_request_payload(request_type, &req_id, request_data);
    let req_bytes = serde_json::to_vec(&req_payload).map_err(|e| e.to_string())?;
    stream
        .write_all(&encode_ws_client_text_frame(&req_bytes))
        .map_err(|e| format!("Failed to send Request frame: {e}"))?;

    // Read Op 7 (RequestResponse)
    let resp = loop {
        let resp_bytes = read_ws_server_frame(&mut stream)?;
        let parsed: serde_json::Value = serde_json::from_slice(&resp_bytes)
            .map_err(|e| format!("Invalid RequestResponse JSON from OBS: {e}"))?;
        let op = parsed
            .get("op")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0);
        if op == 7 {
            break parsed;
        }
        // Discard Op 5 (Event) or heartbeat frames while awaiting RequestResponse
    };

    if let Some(d) = resp.get("d") {
        let request_status = d.get("requestStatus");
        let result = request_status
            .and_then(|s| s.get("result"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        if !result {
            let comment = request_status
                .and_then(|s| s.get("comment"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Unknown OBS error");
            return Err(format!("OBS request '{request_type}' failed: {comment}"));
        }
        return Ok(d.get("responseData").cloned().unwrap_or(serde_json::Value::Null));
    }

    Err(format!("Unexpected response frame from OBS: {resp}"))
}

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
            let quiet_sec = 0.0;
            let poll_interval_sec = 0.25;

            while flag_clone.load(Ordering::Relaxed) {
                std::thread::sleep(std::time::Duration::from_millis(250));
                if !flag_clone.load(Ordering::Relaxed) {
                    break;
                }

                let is_recording = match execute_obs_rpc_command("GetRecordStatus", None, None) {
                    Ok(resp) => resp.get("outputActive").and_then(serde_json::Value::as_bool).unwrap_or(false),
                    Err(_) => {
                        active_sec = 0.0;
                        blank_sec = 0.0;
                        continue;
                    }
                };

                let decision = evaluate_capture_trigger(
                    is_recording,
                    true,
                    None,
                    active_sec,
                    blank_sec,
                    quiet_sec,
                    0.10,
                    3.50,
                    25.0,
                );

                match decision {
                    CaptureTriggerDecision::StartRecording => {
                        let _ = execute_obs_rpc_command("StartRecord", None, None);
                        active_sec = 0.0;
                    }
                    CaptureTriggerDecision::StopRecording => {
                        let _ = execute_obs_rpc_command("StopRecord", None, None);
                        blank_sec = 0.0;
                    }
                    CaptureTriggerDecision::ContinueWaiting => {
                        active_sec += poll_interval_sec;
                    }
                    CaptureTriggerDecision::HoldRecording => {
                        blank_sec = 0.0;
                    }
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

