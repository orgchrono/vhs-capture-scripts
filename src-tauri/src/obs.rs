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
}
