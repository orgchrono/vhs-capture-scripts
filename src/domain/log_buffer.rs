//! Bounded subprocess log ring buffer and byte-stream line assembler.
//!
//! Replaces the legacy `ProcessManager.process_logs` list and `ANSI_ESCAPE_RE` handling.
//! Contains zero I/O: callers feed raw bytes and read immutable snapshots.

use std::collections::VecDeque;

const ESCAPE: char = '\u{1b}';

/// Pure ANSI CSI escape-sequence stripper (`ESC [ ... <final byte>`).
#[must_use]
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == ESCAPE && chars.peek() == Some(&'[') {
            chars.next();
            for next in chars.by_ref() {
                if next.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// Splits arbitrary byte chunks into clean log lines. `\n` and `\r` both terminate a line so
/// carriage-return progress bars become discrete entries.
#[derive(Debug, Default, Clone)]
pub struct LineAssembler {
    pending: Vec<u8>,
}

impl LineAssembler {
    fn drain_line(&mut self) -> Option<String> {
        let text = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        let clean = strip_ansi(&text).trim_end().to_string();
        (!clean.trim().is_empty()).then_some(clean)
    }

    /// Feeds a chunk of bytes and returns every line completed by it.
    pub fn feed(&mut self, chunk: &[u8]) -> Vec<String> {
        let mut lines = Vec::new();
        for &byte in chunk {
            if byte == b'\n' || byte == b'\r' {
                lines.extend(self.drain_line());
            } else {
                self.pending.push(byte);
            }
        }
        lines
    }

    /// Flushes a trailing unterminated line, if any.
    pub fn flush(&mut self) -> Option<String> {
        self.drain_line()
    }
}

/// Fixed-capacity ring of log lines addressed by a monotonic cursor.
#[derive(Debug, Clone)]
pub struct LogRing {
    capacity: usize,
    lines: VecDeque<String>,
    total: u64,
}

impl LogRing {
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            lines: VecDeque::new(),
            total: 0,
        }
    }

    pub fn push(&mut self, line: String) {
        if self.lines.len() == self.capacity {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
        self.total += 1;
    }

    pub fn clear(&mut self) {
        self.lines.clear();
        self.total = 0;
    }

    #[must_use]
    pub fn snapshot(&self) -> Vec<String> {
        self.lines.iter().cloned().collect()
    }

    /// Returns the lines appended after `cursor` and the cursor to use for the next poll.
    #[must_use]
    pub fn since(&self, cursor: u64) -> (Vec<String>, u64) {
        let first_seq = self.total - self.lines.len() as u64;
        let effective = if cursor > self.total { 0 } else { cursor };
        let skip = effective.max(first_seq) - first_seq;
        let fresh = self.lines.iter().skip(skip as usize).cloned().collect();
        (fresh, self.total)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_removes_color_codes() {
        assert_eq!(strip_ansi("\u{1b}[31mERROR\u{1b}[0m done"), "ERROR done");
        assert_eq!(strip_ansi("plain"), "plain");
    }

    #[test]
    fn test_line_assembler_splits_on_cr_and_lf_across_chunks() {
        let mut asm = LineAssembler::default();
        assert_eq!(asm.feed(b"abc\rde"), vec!["abc".to_string()]);
        assert_eq!(asm.feed(b"f\n\n"), vec!["def".to_string()]);
        assert_eq!(asm.feed(b"tail"), Vec::<String>::new());
        assert_eq!(asm.flush(), Some("tail".to_string()));
        assert_eq!(asm.flush(), None);
    }

    #[test]
    fn test_ring_is_bounded_and_cursor_survives_eviction() {
        let mut ring = LogRing::new(3);
        for i in 0..5 {
            ring.push(format!("l{i}"));
        }
        assert_eq!(ring.snapshot(), vec!["l2", "l3", "l4"]);
        let (lines, next) = ring.since(0);
        assert_eq!(lines, vec!["l2", "l3", "l4"]);
        assert_eq!(next, 5);
        ring.push("l5".into());
        let (lines, next) = ring.since(next);
        assert_eq!(lines, vec!["l5"]);
        assert_eq!(next, 6);
    }

    #[test]
    fn test_ring_clear_resets_stale_cursors() {
        let mut ring = LogRing::new(3);
        ring.push("a".into());
        ring.clear();
        ring.push("b".into());
        let (lines, next) = ring.since(42);
        assert_eq!(lines, vec!["b"]);
        assert_eq!(next, 1);
    }
}
