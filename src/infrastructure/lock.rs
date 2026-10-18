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

use std::fs;
use std::io;
use std::path::Path;

/// Check if a process ID is actively running on the host OS without window flashes.
#[must_use]
pub fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let mut cmd = Command::new("tasklist");
        cmd.args(["/fi", &format!("PID eq {pid}"), "/nh"]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd.output()
            .map(|out| {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.contains(&pid.to_string())
            })
            .unwrap_or(false)
    }

    #[cfg(not(windows))]
    {
        // Safe POSIX fallback without requiring external packages
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
    }
}

/// Attempt to acquire process mutual exclusion lock file.
pub fn try_acquire_file_lock(lock_path: &Path, current_pid: u32, label: &str) -> io::Result<LockDecision> {
    let existing_pid = if lock_path.exists() {
        let content = fs::read_to_string(lock_path)?;
        parse_lock_pid(&content)
    } else {
        None
    };

    let is_active = existing_pid.map(is_pid_alive).unwrap_or(false);
    let decision = evaluate_lock_decision(existing_pid, is_active, current_pid);

    if decision == LockDecision::Acquired {
        if let Some(parent) = lock_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(lock_path, format_lock_content(current_pid, label))?;
    }

    Ok(decision)
}

/// Release process mutual exclusion lock file if owned by `current_pid`.
pub fn release_file_lock(lock_path: &Path, current_pid: u32) -> io::Result<bool> {
    if lock_path.exists() {
        let content = fs::read_to_string(lock_path)?;
        if let Some(pid) = parse_lock_pid(&content) {
            if pid == current_pid {
                fs::remove_file(lock_path)?;
                return Ok(true);
            }
        }
    }
    Ok(false)
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

    #[test]
    fn test_try_acquire_and_release_file_lock() {
        let temp_dir = std::env::temp_dir();
        let lock_path = temp_dir.join(format!("vhs_test_lock_{}.lock", std::process::id()));

        let _ = std::fs::remove_file(&lock_path);

        let decision1 = try_acquire_file_lock(&lock_path, 999999, "test_job").expect("Lock acquisition failed");
        assert_eq!(decision1, LockDecision::Acquired);
        assert!(lock_path.exists());

        let decision2 = try_acquire_file_lock(&lock_path, 999999, "test_job").expect("Lock check failed");
        assert_eq!(decision2, LockDecision::AlreadyOwned);

        let released = release_file_lock(&lock_path, 999999).expect("Release failed");
        assert!(released);
        assert!(!lock_path.exists());
    }
}

