//! Pure HTTP/1.1 wire codec: request parsing, query decoding and response framing.
//!
//! Contains zero socket I/O (see `http_server`). Replaces the framing duties previously
//! done by FastAPI/uvicorn in the legacy Python backend.

use crate::models::constants::MAX_HTTP_BODY_BYTES;

const HEAD_TERMINATOR: &[u8] = b"\r\n\r\n";

/// Parsed request line + headers (body not yet read).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestHead {
    pub method: String,
    pub path: String,
    pub query: String,
    pub headers: Vec<(String, String)>,
    pub content_length: usize,
}

/// Fully parsed incoming HTTP/1.1 request envelope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub query: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl HttpRequest {
    /// Request target as seen on the wire (`/path?query`).
    #[must_use]
    pub fn target(&self) -> String {
        if self.query.is_empty() {
            self.path.clone()
        } else {
            format!("{}?{}", self.path, self.query)
        }
    }
}

/// Offset of the first byte after the blank line terminating the header block.
#[must_use]
pub fn find_head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(HEAD_TERMINATOR.len())
        .position(|w| w == HEAD_TERMINATOR)
        .map(|idx| idx + HEAD_TERMINATOR.len())
}

/// Parses the request line and headers from a head string.
#[must_use]
pub fn parse_request_head(head: &str) -> Option<RequestHead> {
    let mut lines = head.lines();
    let mut parts = lines.next()?.split_whitespace();
    let method = parts.next()?.to_uppercase();
    let target = parts.next()?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let headers: Vec<(String, String)> = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
        .collect();
    let content_length = headers
        .iter()
        .find(|(k, _)| k == "content-length")
        .and_then(|(_, v)| v.parse::<usize>().ok())
        .unwrap_or(0)
        .min(MAX_HTTP_BODY_BYTES + 1);
    Some(RequestHead {
        method,
        path: path.to_string(),
        query: query.to_string(),
        headers,
        content_length,
    })
}

/// Parses a complete raw request buffer (head + whatever body bytes are present).
#[must_use]
pub fn parse_http_request(raw_bytes: &[u8]) -> Option<HttpRequest> {
    let head_end = find_head_end(raw_bytes).unwrap_or(raw_bytes.len());
    let head = parse_request_head(std::str::from_utf8(&raw_bytes[..head_end]).ok()?)?;
    let body_bytes = &raw_bytes[head_end.min(raw_bytes.len())..];
    let body = String::from_utf8_lossy(body_bytes)
        .trim_matches('\0')
        .to_string();
    Some(HttpRequest {
        method: head.method,
        path: head.path,
        query: head.query,
        headers: head.headers,
        body,
    })
}

/// Decodes `%XX` escapes and `+` into a UTF-8 string (lossy on malformed UTF-8).
#[must_use]
pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
                match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                    Some(v) => {
                        out.push(v);
                        i += 3;
                    }
                    None => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parses a query string into decoded key/value pairs.
#[must_use]
pub fn parse_query_string(query: &str) -> Vec<(String, String)> {
    query
        .split('&')
        .filter(|kv| !kv.is_empty())
        .map(|kv| {
            let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
            (percent_decode(k), percent_decode(v))
        })
        .collect()
}

/// Extracts a single decoded query parameter from a request target (`/path?a=b`).
#[must_use]
pub fn query_param(target: &str, key: &str) -> Option<String> {
    let query = target.split_once('?').map_or("", |(_, q)| q);
    parse_query_string(query)
        .into_iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v)
}

/// Pure function resolving Content-Type MIME header from file extension.
#[must_use]
pub fn guess_mime_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    let ext = lower.rsplit('.').next().unwrap_or("");
    match ext {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// Pure path traversal guard preventing directory escape (`..`).
#[must_use]
pub fn is_safe_relative_asset_path(req_path: &str) -> bool {
    !req_path.contains("..") && !req_path.contains('\\') && !req_path.contains('\0')
}

fn reason_phrase(status_code: u16) -> &'static str {
    match status_code {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        413 => "Payload Too Large",
        500 => "Internal Server Error",
        501 => "Not Implemented",
        _ => "OK",
    }
}

fn cors_headers(allow_origin: Option<&str>) -> String {
    allow_origin.map_or_else(String::new, |origin| {
        format!(
            "Access-Control-Allow-Origin: {origin}\r\n\
             Access-Control-Allow-Credentials: true\r\n\
             Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n\
             Access-Control-Allow-Headers: Content-Type, X-Session-Token\r\n\
             Vary: Origin\r\n"
        )
    })
}

/// Formats a complete fixed-length HTTP/1.1 response. CORS headers are emitted only for an
/// explicitly allowed origin.
#[must_use]
pub fn format_http_response(
    status_code: u16,
    content_type: &str,
    body: &[u8],
    allow_origin: Option<&str>,
) -> Vec<u8> {
    let header = format!(
        "HTTP/1.1 {status_code} {}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         {}Connection: close\r\n\r\n",
        reason_phrase(status_code),
        body.len(),
        cors_headers(allow_origin)
    );
    let mut packet = Vec::with_capacity(header.len() + body.len());
    packet.extend_from_slice(header.as_bytes());
    packet.extend_from_slice(body);
    packet
}

/// Response head opening an unbounded `text/event-stream`.
#[must_use]
pub fn format_sse_head(allow_origin: Option<&str>) -> Vec<u8> {
    format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/event-stream\r\n\
         Cache-Control: no-cache\r\n\
         X-Accel-Buffering: no\r\n\
         {}Connection: close\r\n\r\n",
        cors_headers(allow_origin)
    )
    .into_bytes()
}

/// Frames one SSE `data:` event.
#[must_use]
pub fn format_sse_event(data: &str) -> String {
    format!("data: {data}\n\n")
}

/// Response head opening an unbounded `multipart/x-mixed-replace; boundary=frame`.
#[must_use]
pub fn format_stream_proxy_head(allow_origin: Option<&str>) -> Vec<u8> {
    format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\
         Cache-Control: no-cache, no-store, must-revalidate\r\n\
         Pragma: no-cache\r\n\
         Expires: 0\r\n\
         {}Connection: close\r\n\r\n",
        cors_headers(allow_origin)
    )
    .into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_request_with_query_headers_and_body() {
        let raw = b"POST /api/run?foo=a%20b HTTP/1.1\r\nHost: localhost:8088\r\nContent-Length: 15\r\nX-Session-Token: t\r\n\r\n{\"preset\":\"gold\"}";
        let req = parse_http_request(raw).expect("valid HTTP request");
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/api/run");
        assert_eq!(req.target(), "/api/run?foo=a%20b");
        assert_eq!(query_param(&req.target(), "foo").as_deref(), Some("a b"));
        assert_eq!(req.body, "{\"preset\":\"gold\"}");
        assert!(req.headers.contains(&("x-session-token".into(), "t".into())));
    }

    #[test]
    fn test_head_parsing_reports_content_length_and_head_end() {
        let raw = b"POST /x HTTP/1.1\r\nContent-Length: 4\r\n\r\nbody";
        let end = find_head_end(raw).expect("terminator");
        let head = parse_request_head(std::str::from_utf8(&raw[..end]).expect("utf8"))
            .expect("head");
        assert_eq!(head.content_length, 4);
        assert_eq!(&raw[end..], b"body");
    }

    #[test]
    fn test_percent_decode_handles_unicode_plus_and_garbage() {
        assert_eq!(percent_decode("C%3A%5Ctapes%5Cv%C3%ADdeo.mkv"), "C:\\tapes\\vídeo.mkv");
        assert_eq!(percent_decode("a+b"), "a b");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    #[test]
    fn test_query_string_pairs() {
        let pairs = parse_query_string("a=1&b=&c");
        assert_eq!(
            pairs,
            vec![
                ("a".to_string(), "1".to_string()),
                ("b".to_string(), String::new()),
                ("c".to_string(), String::new())
            ]
        );
    }

    #[test]
    fn test_cors_only_for_allowed_origin() {
        let with = String::from_utf8(format_http_response(200, "text/plain", b"ok", Some("http://localhost"))).expect("utf8");
        assert!(with.contains("Access-Control-Allow-Origin: http://localhost"));
        let without = String::from_utf8(format_http_response(200, "text/plain", b"ok", None)).expect("utf8");
        assert!(!without.contains("Access-Control-Allow-Origin"));
        assert!(without.contains("Content-Length: 2"));
    }

    #[test]
    fn test_mime_and_asset_guard() {
        assert_eq!(guess_mime_type("index.html"), "text/html; charset=utf-8");
        assert_eq!(guess_mime_type("a/b.JPG"), "image/jpeg");
        assert!(!is_safe_relative_asset_path("/../x"));
        assert!(!is_safe_relative_asset_path("/a\\b"));
    }

    #[test]
    fn test_sse_event_framing() {
        assert_eq!(format_sse_event("{}"), "data: {}\n\n");
    }
}
