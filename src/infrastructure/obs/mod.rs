//! OBS Studio WebSocket v5 Protocol Engine and Imperative Watcher.
//!
//! Re-exports pure frame analysis, Base64 codecs, and authentication from `domain::obs_signal`.
//! Implements RFC 6455 framing, TCP socket RPC, process lifecycle, and background auto-watcher.

pub mod auto_watcher;
pub mod rpc_client;
pub mod ws_codec;

pub use auto_watcher::*;
pub use crate::domain::obs_signal::*;
pub use rpc_client::*;
pub use ws_codec::*;

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
    fn test_base64_decode() {
        assert_eq!(base64_decode("").unwrap(), b"");
        assert_eq!(base64_decode("Zg==").unwrap(), b"f");
        assert_eq!(base64_decode("Zm8=").unwrap(), b"fo");
        assert_eq!(base64_decode("Zm9v").unwrap(), b"foo");
        assert_eq!(base64_decode("Zm9vYg==").unwrap(), b"foob");
        assert_eq!(base64_decode("Zm9vYmE=").unwrap(), b"fooba");
        assert_eq!(base64_decode("Zm9vYmFy").unwrap(), b"foobar");
        assert!(base64_decode("invalid!").is_err());
        assert!(base64_decode("Zg=").is_err()); // invalid length
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
