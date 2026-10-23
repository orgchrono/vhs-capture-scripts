//! OS-level process signalling: suspend, resume and kill-tree.
//!
//! Single Responsibility: platform syscalls only. Replaces the `psutil` calls used by the
//! legacy `ProcessManager` (`pause`, `resume`, `terminate`).

use crate::infrastructure::toolchain::create_silent_command;
use std::path::Path;
use std::process::Stdio;

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    const PROCESS_SUSPEND_RESUME: u32 = 0x0800;

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(desired_access: u32, inherit_handle: i32, pid: u32) -> *mut c_void;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn NtSuspendProcess(handle: *mut c_void) -> i32;
        fn NtResumeProcess(handle: *mut c_void) -> i32;
    }

    fn with_process_handle(
        pid: u32,
        action: unsafe extern "system" fn(*mut c_void) -> i32,
    ) -> Result<(), String> {
        // SAFETY: the handle is validated for null, used for exactly one NT call and closed.
        unsafe {
            let handle = OpenProcess(PROCESS_SUSPEND_RESUME, 0, pid);
            if handle.is_null() {
                return Err(format!("cannot open process {pid}"));
            }
            let status = action(handle);
            CloseHandle(handle);
            if status >= 0 {
                Ok(())
            } else {
                Err(format!("NT call failed for process {pid} (status {status:#x})"))
            }
        }
    }

    pub fn suspend(pid: u32) -> Result<(), String> {
        with_process_handle(pid, NtSuspendProcess)
    }

    pub fn resume(pid: u32) -> Result<(), String> {
        with_process_handle(pid, NtResumeProcess)
    }
}

fn run_signal_tool(program: &str, args: &[String]) -> Result<(), String> {
    let status = create_silent_command(Path::new(program))
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("failed to run '{program}': {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("'{program}' exited with {:?}", status.code()))
    }
}

#[cfg(not(windows))]
fn send_posix_signal(signal: &str, pid: u32) -> Result<(), String> {
    run_signal_tool("kill", &[format!("-{signal}"), pid.to_string()])
}

/// Suspends every thread of the process.
pub fn suspend_process(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::suspend(pid)
    }
    #[cfg(not(windows))]
    {
        send_posix_signal("STOP", pid)
    }
}

/// Resumes a previously suspended process.
pub fn resume_process(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        win::resume(pid)
    }
    #[cfg(not(windows))]
    {
        send_posix_signal("CONT", pid)
    }
}

/// Forcefully terminates the process and all of its descendants.
pub fn kill_process_tree(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        run_signal_tool(
            "taskkill",
            &["/PID".into(), pid.to_string(), "/T".into(), "/F".into()],
        )
    }
    #[cfg(not(windows))]
    {
        let _ = run_signal_tool("pkill", &["-KILL".into(), "-P".into(), pid.to_string()]);
        send_posix_signal("KILL", pid)
    }
}
