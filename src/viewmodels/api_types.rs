//! Wire-level request/response envelopes shared by every API ViewModel.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Incoming API request descriptor (`path` carries the query string when present).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub path: String,
    pub body_json: String,
}

/// Outgoing API response descriptor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status_code: u16,
    pub body_json: String,
}

impl ApiRequest {
    /// Path without query string.
    #[must_use]
    pub fn clean_path(&self) -> &str {
        self.path.split('?').next().unwrap_or(self.path.as_str())
    }

    /// Body parsed as JSON; malformed or empty bodies become an empty object.
    #[must_use]
    pub fn json_body(&self) -> Value {
        serde_json::from_str(&self.body_json).unwrap_or_else(|_| json!({}))
    }

    /// Decoded query parameter by name.
    #[must_use]
    pub fn query(&self, key: &str) -> Option<String> {
        crate::infrastructure::http_codec::query_param(&self.path, key)
    }
}

impl ApiResponse {
    #[must_use]
    pub fn ok(payload: &Value) -> Self {
        Self {
            status_code: 200,
            body_json: payload.to_string(),
        }
    }

    #[must_use]
    pub fn error(status_code: u16, message: &str) -> Self {
        Self {
            status_code,
            body_json: json!({ "status": "error", "error": message }).to_string(),
        }
    }

    /// Legacy action envelope: `{"status":"ok","message":…}`.
    #[must_use]
    pub fn status_ok(message: &str) -> Self {
        Self::ok(&json!({ "status": "ok", "message": message }))
    }

    /// Legacy action envelope that reports a business failure with HTTP 200.
    #[must_use]
    pub fn status_error(message: &str) -> Self {
        Self::ok(&json!({ "status": "error", "message": message }))
    }

    /// Maps `Result<message, message>` onto the legacy action envelope.
    #[must_use]
    pub fn from_action(result: Result<String, String>) -> Self {
        match result {
            Ok(message) => Self::status_ok(&message),
            Err(message) => Self::status_error(&message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_helpers() {
        let req = ApiRequest {
            method: "GET".into(),
            path: "/api/x?source=a%20b&n=1".into(),
            body_json: "not json".into(),
        };
        assert_eq!(req.clean_path(), "/api/x");
        assert_eq!(req.query("source").as_deref(), Some("a b"));
        assert_eq!(req.json_body(), json!({}));
    }

    #[test]
    fn test_action_envelopes() {
        assert_eq!(ApiResponse::from_action(Ok("done".into())).body_json, r#"{"message":"done","status":"ok"}"#);
        assert!(ApiResponse::from_action(Err("bad".into())).body_json.contains("\"error\""));
        assert_eq!(ApiResponse::error(400, "x").status_code, 400);
    }
}
