//! Thread-safe subprocess lifecycle manager with bounded log capture.
//!
//! Native replacement for legacy `api/process_manager.py::ProcessManager`
//! (`start_process`, `get_logs`, `is_running`, `pause`, `resume`, `terminate`,
//! `last_exit_code`, `last_success`).

use crate::domain::log_buffer::{LineAssembler, LogRing};
use crate::infrastructure::process_control::{kill_process_tree, resume_process, suspend_process};
use crate::infrastructure::toolchain::create_silent_command;
use crate::models::constants::MAX_PROCESS_LOGS_HISTORY;
use std::io::Read;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};

#[derive(Debug)]
struct ProcessState {
    pid: Option<u32>,
    paused: bool,
    terminated_by_user: bool,
    logs: LogRing,
    last_exit_code: Option<i32>,
    last_success: Option<bool>,
}

/// Immutable view of the manager state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProcessSnapshot {
    pub running: bool,
    pub paused: bool,
    pub last_exit_code: Option<i32>,
    pub last_success: Option<bool>,
}

/// Cheaply clonable handle to the shared subprocess state.
#[derive(Debug, Clone)]
pub struct ProcessManager {
    shared: Arc<Mutex<ProcessState>>,
}

fn lock(shared: &Mutex<ProcessState>) -> MutexGuard<'_, ProcessState> {
    shared.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn pump_stream<R: Read>(mut reader: R, shared: &Mutex<ProcessState>) {
    let mut assembler = LineAssembler::default();
    let mut buf = [0u8; 4096];
    while let Ok(n) = reader.read(&mut buf) {
        if n == 0 {
            break;
        }
        let lines = assembler.feed(&buf[..n]);
        let mut state = lock(shared);
        lines.into_iter().for_each(|l| state.logs.push(l));
    }
    if let Some(tail) = assembler.flush() {
        lock(shared).logs.push(tail);
    }
}

fn spawn_pump<R: Read + Send + 'static>(
    reader: Option<R>,
    shared: &Arc<Mutex<ProcessState>>,
) -> Option<JoinHandle<()>> {
    reader.map(|r| {
        let shared = Arc::clone(shared);
        thread::spawn(move || pump_stream(r, &shared))
    })
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new(MAX_PROCESS_LOGS_HISTORY)
    }
}

impl ProcessManager {
    #[must_use]
    pub fn new(log_capacity: usize) -> Self {
        Self {
            shared: Arc::new(Mutex::new(ProcessState {
                pid: None,
                paused: false,
                terminated_by_user: false,
                logs: LogRing::new(log_capacity),
                last_exit_code: None,
                last_success: None,
            })),
        }
    }

    #[must_use]
    pub fn snapshot(&self) -> ProcessSnapshot {
        let state = lock(&self.shared);
        ProcessSnapshot {
            running: state.pid.is_some(),
            paused: state.paused,
            last_exit_code: state.last_exit_code,
            last_success: state.last_success,
        }
    }

    #[must_use]
    pub fn is_running(&self) -> bool {
        self.snapshot().running
    }

    #[must_use]
    pub fn logs(&self) -> Vec<String> {
        lock(&self.shared).logs.snapshot()
    }

    #[must_use]
    pub fn logs_since(&self, cursor: u64) -> (Vec<String>, u64) {
        lock(&self.shared).logs.since(cursor)
    }

    /// Appends a manager-originated line to the log stream.
    pub fn append_log(&self, line: impl Into<String>) {
        lock(&self.shared).logs.push(line.into());
    }

    /// Spawns `program args…` capturing stdout/stderr. Fails if a process is already active.
    pub fn start(&self, program: &Path, args: &[String]) -> Result<(), String> {
        let mut state = lock(&self.shared);
        if state.pid.is_some() {
            return Err("Please wait for current process to finish.".to_string());
        }
        let mut child = create_silent_command(program)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start process '{}': {e}", program.display()))?;

        state.pid = Some(child.id());
        state.paused = false;
        state.terminated_by_user = false;
        state.logs.clear();
        state.last_exit_code = None;
        state.last_success = None;
        drop(state);

        let pumps = [
            spawn_pump(child.stdout.take(), &self.shared),
            spawn_pump(child.stderr.take(), &self.shared),
        ];
        let shared = Arc::clone(&self.shared);
        thread::spawn(move || {
            let status = child.wait();
            pumps.into_iter().flatten().for_each(|h| {
                let _ = h.join();
            });
            let mut state = lock(&shared);
            let code = status.ok().and_then(|s| s.code());
            state.pid = None;
            state.paused = false;
            state.last_exit_code = code;
            state.last_success = Some(code == Some(0) && !state.terminated_by_user);
        });
        Ok(())
    }

    /// Suspends the active process.
    pub fn pause(&self) -> Result<String, String> {
        let mut state = lock(&self.shared);
        let pid = state.pid.ok_or("No process currently running.")?;
        if state.paused {
            return Err("Process is already paused.".to_string());
        }
        suspend_process(pid)?;
        state.paused = true;
        Ok("Process paused.".to_string())
    }

    /// Resumes a suspended process.
    pub fn resume(&self) -> Result<String, String> {
        let mut state = lock(&self.shared);
        let pid = state.pid.ok_or("No process currently running.")?;
        if !state.paused {
            return Err("Process is not paused.".to_string());
        }
        resume_process(pid)?;
        state.paused = false;
        Ok("Process resumed.".to_string())
    }

    /// Kills the active process tree. Returns `false` when nothing was running.
    pub fn terminate(&self) -> bool {
        let mut state = lock(&self.shared);
        let Some(pid) = state.pid else {
            return false;
        };
        state.terminated_by_user = true;
        let was_paused = std::mem::replace(&mut state.paused, false);
        drop(state);
        if was_paused {
            let _ = resume_process(pid);
        }
        kill_process_tree(pid).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn shell(script: &str) -> (std::path::PathBuf, Vec<String>) {
        if cfg!(windows) {
            ("cmd".into(), vec!["/C".into(), script.into()])
        } else {
            ("sh".into(), vec!["-c".into(), script.into()])
        }
    }

    fn wait_until_idle(pm: &ProcessManager) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while pm.is_running() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(25));
        }
        assert!(!pm.is_running(), "process did not finish in time");
    }

    fn long_running() -> (std::path::PathBuf, Vec<String>) {
        if cfg!(windows) {
            ("ping".into(), vec!["-n".into(), "30".into(), "127.0.0.1".into()])
        } else {
            ("sleep".into(), vec!["30".into()])
        }
    }

    #[test]
    fn test_captures_logs_and_exit_status() {
        let pm = ProcessManager::default();
        let (prog, args) = shell("echo hello-native");
        pm.start(&prog, &args).expect("start");
        wait_until_idle(&pm);
        let snap = pm.snapshot();
        assert_eq!(snap.last_exit_code, Some(0));
        assert_eq!(snap.last_success, Some(true));
        assert!(pm.logs().iter().any(|l| l.contains("hello-native")));
    }

    #[test]
    fn test_failure_exit_code_is_reported() {
        let pm = ProcessManager::default();
        let (prog, args) = shell("exit 3");
        pm.start(&prog, &args).expect("start");
        wait_until_idle(&pm);
        assert_eq!(pm.snapshot().last_exit_code, Some(3));
        assert_eq!(pm.snapshot().last_success, Some(false));
    }

    #[test]
    fn test_rejects_concurrent_start_and_terminates() {
        let pm = ProcessManager::default();
        let (prog, args) = long_running();
        pm.start(&prog, &args).expect("start");
        assert!(pm.start(&prog, &args).is_err());
        assert!(pm.terminate());
        wait_until_idle(&pm);
        assert_eq!(pm.snapshot().last_success, Some(false));
        assert!(!pm.terminate());
    }

    #[test]
    fn test_pause_and_resume_cycle() {
        let pm = ProcessManager::default();
        assert!(pm.pause().is_err());
        let (prog, args) = long_running();
        pm.start(&prog, &args).expect("start");
        pm.pause().expect("pause");
        assert!(pm.snapshot().paused);
        assert!(pm.pause().is_err());
        pm.resume().expect("resume");
        assert!(!pm.snapshot().paused);
        assert!(pm.terminate());
        wait_until_idle(&pm);
    }
}
