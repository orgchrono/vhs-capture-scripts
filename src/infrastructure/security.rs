//! HTTP security policy: host/origin/token verification and path-traversal guards.
//!
//! Ports legacy `api/routers/security.py` (`make_origin_verifier`, `is_safe_media_path`,
//! `is_safe_ingest_path`). Decisions are pure; only the path guards consult the file system
//! through explicit, injected roots.

use crate::models::constants::{
    BLOCK_DEVICE_PREFIXES, LOOPBACK_HOSTS, SESSION_TOKEN_LENGTH, VALID_INGEST_EXTENSIONS,
};
use crate::models::media::is_valid_media_extension;
use sha2::{Digest, Sha256};
use std::path::Path;

/// Outcome of the per-request security verification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecurityVerdict {
    Allow,
    Deny { status: u16, error: &'static str },
}

/// Case-insensitive header lookup over lowercase-keyed header pairs.
#[must_use]
pub fn find_header<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| v.as_str())
}

/// Derives an unguessable hex session token from caller-provided entropy.
#[must_use]
pub fn derive_session_token(entropy: &[u8]) -> String {
    let digest = Sha256::digest(entropy);
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    hex[..SESSION_TOKEN_LENGTH.min(hex.len())].to_string()
}

/// Strips the optional `:port` suffix from a `Host`/authority string (IPv6 aware).
#[must_use]
pub fn authority_host(authority: &str) -> &str {
    if authority.starts_with('[') {
        return authority
            .find(']')
            .map_or(authority, |end| &authority[..=end]);
    }
    authority.split(':').next().unwrap_or(authority)
}

/// True when the `Host` header designates a loopback / embedded WebView host.
#[must_use]
pub fn is_host_allowed(host_header: &str) -> bool {
    LOOPBACK_HOSTS.contains(&authority_host(host_header))
}

/// True when an `Origin` header designates a loopback / embedded WebView origin.
#[must_use]
pub fn is_origin_allowed(origin: &str) -> bool {
    ["http://", "https://", "tauri://"]
        .iter()
        .find_map(|scheme| origin.strip_prefix(scheme))
        .is_some_and(is_host_allowed)
}

/// Constant-time token comparison.
#[must_use]
pub fn tokens_match(provided: &str, expected: &str) -> bool {
    let (a, b) = (provided.as_bytes(), expected.as_bytes());
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Verifies a `/api/*` request: loopback host, same-origin for POST and session token.
#[must_use]
pub fn verify_api_request(
    method: &str,
    headers: &[(String, String)],
    session_token: &str,
) -> SecurityVerdict {
    if !find_header(headers, "host").is_some_and(is_host_allowed) {
        return SecurityVerdict::Deny {
            status: 403,
            error: "Access denied.",
        };
    }
    if method.eq_ignore_ascii_case("POST")
        && find_header(headers, "origin").is_some_and(|o| !is_origin_allowed(o))
    {
        return SecurityVerdict::Deny {
            status: 403,
            error: "Invalid origin.",
        };
    }
    if find_header(headers, "x-session-token").is_some_and(|t| !tokens_match(t, session_token)) {
        return SecurityVerdict::Deny {
            status: 403,
            error: "Invalid session token.",
        };
    }
    SecurityVerdict::Allow
}

/// Directory roots against which media paths are validated.
#[derive(Debug, Clone, Copy)]
pub struct MediaRoots<'a> {
    pub media_dir: &'a Path,
    pub raw_dir: &'a Path,
}

/// Pure syntactic traversal check (`..`, NUL, empty).
#[must_use]
pub fn has_path_traversal(raw: &str) -> bool {
    raw.trim().is_empty() || raw.contains('\0') || raw.contains("..")
}

fn extension_of(raw: &str) -> String {
    Path::new(raw)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_plain_file_name(raw: &str) -> bool {
    let trimmed = raw.trim();
    !trimmed.contains('/') && !trimmed.contains('\\')
}

/// Validates a media path: stays under `media/`, is a known raw file name, or is an existing
/// absolute file with an authorised media extension.
#[must_use]
pub fn is_safe_media_path(raw: &str, roots: &MediaRoots<'_>) -> bool {
    if has_path_traversal(raw) {
        return false;
    }
    let normalized = raw.replace('\\', "/");
    let normalized = normalized.trim_start_matches("./");
    if normalized == "media" || normalized.starts_with("media/") {
        return true;
    }
    if is_plain_file_name(raw) {
        let name = raw.trim();
        if roots.raw_dir.join(name).exists() || roots.media_dir.join(name).exists() {
            return true;
        }
    }
    let path = Path::new(raw);
    if path.is_absolute() && path.starts_with(roots.media_dir) {
        return true;
    }
    path.is_absolute() && path.is_file() && is_valid_media_extension(&extension_of(raw))
}

/// Validates an ingest source: any safe media path, a physical block device, or a disk image.
#[must_use]
pub fn is_safe_ingest_path(raw: &str, roots: &MediaRoots<'_>) -> bool {
    if has_path_traversal(raw) {
        return false;
    }
    if is_safe_media_path(raw, roots) {
        return true;
    }
    if BLOCK_DEVICE_PREFIXES.iter().any(|p| raw.starts_with(p)) {
        return true;
    }
    let ext = extension_of(raw);
    VALID_INGEST_EXTENSIONS.contains(&ext.as_str()) || is_valid_media_extension(&ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn test_host_and_origin_allow_list() {
        assert!(is_host_allowed("127.0.0.1:8088"));
        assert!(is_host_allowed("localhost"));
        assert!(is_host_allowed("[::1]:8088"));
        assert!(!is_host_allowed("127.0.0.1.evil.com"));
        assert!(!is_host_allowed("evil.com:8088"));
        assert!(is_origin_allowed("http://127.0.0.1:8088"));
        assert!(is_origin_allowed("http://tauri.localhost"));
        assert!(!is_origin_allowed("https://evil.example"));
    }

    #[test]
    fn test_verify_api_request_matrix() {
        let ok = headers(&[("Host", "127.0.0.1:8088"), ("X-Session-Token", "abc")]);
        assert_eq!(verify_api_request("GET", &ok, "abc"), SecurityVerdict::Allow);
        assert_eq!(
            verify_api_request("GET", &ok, "zzz"),
            SecurityVerdict::Deny {
                status: 403,
                error: "Invalid session token."
            }
        );
        let bad_host = headers(&[("Host", "evil.com")]);
        assert!(matches!(
            verify_api_request("GET", &bad_host, "abc"),
            SecurityVerdict::Deny { status: 403, .. }
        ));
        let bad_origin = headers(&[("Host", "localhost"), ("Origin", "http://evil.com")]);
        assert!(matches!(
            verify_api_request("POST", &bad_origin, "abc"),
            SecurityVerdict::Deny { status: 403, .. }
        ));
        assert_eq!(
            verify_api_request("GET", &bad_origin, "abc"),
            SecurityVerdict::Allow
        );
    }

    #[test]
    fn test_session_token_shape_and_entropy_sensitivity() {
        let a = derive_session_token(b"one");
        let b = derive_session_token(b"two");
        assert_eq!(a.len(), SESSION_TOKEN_LENGTH);
        assert_ne!(a, b);
        assert!(tokens_match(&a, &a));
        assert!(!tokens_match(&a, &b));
    }

    #[test]
    fn test_media_path_guards() {
        let tmp = std::env::temp_dir().join(format!("vhs_sec_{}", std::process::id()));
        let raw = tmp.join("raw");
        std::fs::create_dir_all(&raw).expect("mkdir");
        std::fs::write(raw.join("tape.mkv"), b"x").expect("write");
        let roots = MediaRoots {
            media_dir: &tmp,
            raw_dir: &raw,
        };
        assert!(is_safe_media_path("tape.mkv", &roots));
        assert!(!is_safe_media_path("missing.mkv", &roots));
        assert!(!is_safe_media_path("../etc/passwd", &roots));
        assert!(!is_safe_media_path("a\0b.mkv", &roots));
        assert!(is_safe_media_path("media/raw/x.mkv", &roots));
        assert!(is_safe_media_path(raw.join("tape.mkv").to_str().expect("utf8"), &roots));
        assert!(is_safe_ingest_path("\\\\.\\PhysicalDrive1", &roots));
        assert!(is_safe_ingest_path("dump.img", &roots));
        assert!(!is_safe_ingest_path("notes.txt", &roots));
        let _ = std::fs::remove_dir_all(tmp);
    }
}
