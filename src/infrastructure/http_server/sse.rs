use crate::infrastructure::app_context::AppContext;
use crate::infrastructure::http_codec::{format_sse_event, format_sse_head};
use serde_json::json;
use std::io::Write;
use std::net::TcpStream;
use std::thread;
use std::time::Duration;

pub(crate) fn handle_sse_stream(
    mut stream: TcpStream,
    ctx: &AppContext,
    allow_origin: Option<&str>,
) -> Result<(), ()> {
    let _ = stream.set_read_timeout(None);
    let head = format_sse_head(allow_origin);
    stream.write_all(&head).map_err(|_| ())?;

    let mut cursor = 0u64;
    let mut has_seen_active = false;
    let mut idle_wait_cycles = 0usize;

    loop {
        let snapshot = ctx.process.snapshot();
        let (new_lines, next_cursor) = ctx.process.logs_since(cursor);
        cursor = next_cursor;

        if snapshot.running {
            has_seen_active = true;
        }

        if !new_lines.is_empty() {
            for line in &new_lines {
                let event_json = json!({
                    "line": line,
                    "running": snapshot.running,
                    "active": snapshot.running,
                    "paused": snapshot.paused,
                    "exit_code": snapshot.last_exit_code,
                    "success": snapshot.last_success
                })
                .to_string();
                let event = format_sse_event(&event_json);
                if stream.write_all(event.as_bytes()).is_err() {
                    return Ok(()); // Client disconnected
                }
            }
            let _ = stream.flush();
        }

        if !snapshot.running && new_lines.is_empty() {
            if has_seen_active
                || snapshot.last_exit_code.is_some()
                || snapshot.last_success.is_some()
            {
                // Heartbeat / final state
                let done_event = format_sse_event(
                    &json!({
                        "running": false,
                        "active": false,
                        "paused": false,
                        "exit_code": snapshot.last_exit_code,
                        "success": snapshot.last_success
                    })
                    .to_string(),
                );
                let _ = stream.write_all(done_event.as_bytes());
                let _ = stream.flush();
                thread::sleep(Duration::from_millis(500));
                break;
            }

            // Client connected before process spawn completed; wait up to ~2 seconds sending keepalive pings
            if idle_wait_cycles < 15 {
                idle_wait_cycles += 1;
                let _ = stream.write_all(b": keepalive\n\n");
                let _ = stream.flush();
            } else {
                // Idle stream without active tasks
                let done_event = format_sse_event(
                    &json!({
                        "running": false,
                        "active": false,
                        "paused": false,
                        "exit_code": snapshot.last_exit_code,
                        "success": snapshot.last_success
                    })
                    .to_string(),
                );
                let _ = stream.write_all(done_event.as_bytes());
                let _ = stream.flush();
                break;
            }
        }

        thread::sleep(Duration::from_millis(150));
    }

    Ok(())
}
