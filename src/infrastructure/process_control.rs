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
    const TH32CS_SNAPPROCESS: u32 = 0x00000002;
    const INVALID_HANDLE_VALUE: *mut c_void = -1isize as *mut c_void;

    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; 260],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(desired_access: u32, inherit_handle: i32, pid: u32) -> *mut c_void;
        fn CloseHandle(handle: *mut c_void) -> i32;
        fn CreateToolhelp32Snapshot(dw_flags: u32, th32_process_id: u32) -> *mut c_void;
        fn Process32FirstW(h_snapshot: *mut c_void, lppe: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(h_snapshot: *mut c_void, lppe: *mut ProcessEntry32W) -> i32;
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn NtSuspendProcess(handle: *mut c_void) -> i32;
        fn NtResumeProcess(handle: *mut c_void) -> i32;
    }

    fn get_process_descendants(target_pid: u32) -> Vec<u32> {
        let mut descendants = Vec::new();
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap.is_null() || snap == INVALID_HANDLE_VALUE {
                return descendants;
            }

            let mut entry = ProcessEntry32W {
                dw_size: std::mem::size_of::<ProcessEntry32W>() as u32,
                cnt_usage: 0,
                th32_process_id: 0,
                th32_default_heap_id: 0,
                th32_module_id: 0,
                cnt_threads: 0,
                th32_parent_process_id: 0,
                pc_pri_class_base: 0,
                dw_flags: 0,
                sz_exe_file: [0; 260],
            };

            let mut pairs = Vec::new();
            if Process32FirstW(snap, &mut entry) != 0 {
                loop {
                    pairs.push((entry.th32_process_id, entry.th32_parent_process_id));
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);

            let mut queue = vec![target_pid];
            while let Some(parent) = queue.pop() {
                for &(pid, ppid) in &pairs {
                    if ppid == parent && pid != 0 && pid != parent && !descendants.contains(&pid) {
                        descendants.push(pid);
                        queue.push(pid);
                    }
                }
            }
        }
        descendants
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
        let children = get_process_descendants(pid);
        for child_pid in children {
            let _ = with_process_handle(child_pid, NtSuspendProcess);
        }
        with_process_handle(pid, NtSuspendProcess)
    }

    pub fn resume(pid: u32) -> Result<(), String> {
        let children = get_process_descendants(pid);
        let res = with_process_handle(pid, NtResumeProcess);
        for child_pid in children {
            let _ = with_process_handle(child_pid, NtResumeProcess);
        }
        res
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
        let _ = run_signal_tool("pkill", &["-STOP".into(), "-P".into(), pid.to_string()]);
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
        let res = send_posix_signal("CONT", pid);
        let _ = run_signal_tool("pkill", &["-CONT".into(), "-P".into(), pid.to_string()]);
        res
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
