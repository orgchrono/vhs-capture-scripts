//! OBS WebSocket v5 TCP RPC client and native process launcher.

use super::ws_codec::{encode_ws_client_text_frame, read_ws_server_frame};
use crate::domain::obs_signal::{
    build_identify_payload, build_request_payload, compute_obs_auth_response, ObsRecordStatus,
};

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

/// Real-time client executing an OBS Studio WebSocket v5 RPC call.
/// Connects on SSOT port, completes RFC 6455 handshake, authenticates via challenge-response,
/// sends the request frame, and returns the response payload.
pub fn execute_obs_rpc_command(
    request_type: &str,
    request_data: Option<serde_json::Value>,
    password: Option<&str>,
) -> Result<serde_json::Value, String> {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;

    let host = crate::models::constants::DEFAULT_API_HOST;
    let port = crate::models::constants::DEFAULT_OBS_WS_PORT;
    let addr_str = format!("{host}:{port}");
    let addr: SocketAddr = addr_str
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(300))
        .map_err(|e| format!("Could not connect to OBS WebSocket on port {port}: {e}"))?;

    stream
        .set_read_timeout(Some(Duration::from_millis(1500)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_millis(1500)))
        .map_err(|e| e.to_string())?;

    // 1. Handshake
    let handshake = format!(
        "GET / HTTP/1.1\r\nHost: {addr_str}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
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
