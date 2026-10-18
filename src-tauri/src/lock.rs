//! Single-Instance Process Locking & PID File State Machine.
//!
//! Models deterministic mutual exclusion for video processing pipelines,
//! detecting stale locks, dead process PID cleanup, and race prevention.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LockDecision {
    Acquired,
    Blocked(u32),
    AlreadyOwned,
}

/// Pure parser extracting PID from lock file string format `"<PID>:pipeline_running"`.
#[must_use]
pub fn parse_lock_pid(content: &str) -> Option<u32> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return None;
    }
    let pid_part = match trimmed.split_once(':') {
        Some((pid_str, _)) => pid_str.trim(),
        None => trimmed,
    };
    pid_part.parse::<u32>().ok()
}

/// Pure evaluation of lock acquisition attempt.
#[must_use]
pub fn evaluate_lock_decision(
    existing_pid: Option<u32>,
    is_existing_active: bool,
    current_pid: u32,
) -> LockDecision {
    match existing_pid {
        None => LockDecision::Acquired,
        Some(pid) if pid == current_pid => LockDecision::AlreadyOwned,
        Some(pid) if is_existing_active => LockDecision::Blocked(pid),
        Some(_) => LockDecision::Acquired,
    }
}

/// Format standard lock file content string: `"{pid}:{label}"`.
#[must_use]
pub fn format_lock_content(pid: u32, label: &str) -> String {
    format!("{pid}:{label}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_lock_pid() {
        assert_eq!(parse_lock_pid("12345:pipeline_running"), Some(12345));
        assert_eq!(parse_lock_pid("9999\n"), Some(9999));
        assert_eq!(parse_lock_pid(""), None);
        assert_eq!(parse_lock_pid("invalid:token"), None);
    }

    #[test]
    fn test_evaluate_lock_decision() {
        // No lock present
        assert_eq!(evaluate_lock_decision(None, false, 100), LockDecision::Acquired);

        // Already owned by current process
        assert_eq!(evaluate_lock_decision(Some(100), true, 100), LockDecision::AlreadyOwned);

        // Held by another running process -> blocked
        assert_eq!(evaluate_lock_decision(Some(200), true, 100), LockDecision::Blocked(200));

        // Held by a dead process -> acquired (reclaimed)
        assert_eq!(evaluate_lock_decision(Some(300), false, 100), LockDecision::Acquired);
    }

    #[test]
    fn test_format_lock_content() {
        assert_eq!(format_lock_content(1234, "vhs_studio"), "1234:vhs_studio");
    }
}
