//! Host CPU utilisation sampler (replaces `psutil.cpu_percent(interval=None)`).

use std::sync::Mutex;

/// Cumulative `(idle, total)` CPU time counters in arbitrary but consistent units.
pub type CpuTimes = (u64, u64);

static LAST_SAMPLE: Mutex<Option<CpuTimes>> = Mutex::new(None);

/// Pure utilisation (0–100, one decimal) between two cumulative samples.
#[must_use]
pub fn compute_cpu_percent(previous: CpuTimes, current: CpuTimes) -> f32 {
    let idle = current.0.saturating_sub(previous.0) as f64;
    let total = current.1.saturating_sub(previous.1) as f64;
    if total <= 0.0 {
        return 0.0;
    }
    let busy = ((total - idle) / total * 100.0).clamp(0.0, 100.0);
    ((busy * 10.0).round() / 10.0) as f32
}

/// Parses the aggregate `cpu` line of `/proc/stat` into `(idle, total)`.
#[must_use]
pub fn parse_proc_stat_line(content: &str) -> Option<CpuTimes> {
    let line = content.lines().find(|l| l.starts_with("cpu "))?;
    let fields: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|f| f.parse().ok())
        .collect();
    if fields.len() < 4 {
        return None;
    }
    let idle = fields[3] + fields.get(4).copied().unwrap_or(0);
    Some((idle, fields.iter().sum()))
}

#[cfg(windows)]
fn read_cpu_times() -> Option<CpuTimes> {
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemTimes(idle: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
    }

    let to_u64 = |ft: FileTime| (u64::from(ft.high) << 32) | u64::from(ft.low);
    let (mut idle, mut kernel, mut user) = (FileTime::default(), FileTime::default(), FileTime::default());
    // SAFETY: all three pointers reference valid, writable stack locals for the call duration.
    let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
    // On Windows the kernel time already includes idle time.
    (ok != 0).then(|| (to_u64(idle), to_u64(kernel) + to_u64(user)))
}

#[cfg(target_os = "linux")]
fn read_cpu_times() -> Option<CpuTimes> {
    parse_proc_stat_line(&std::fs::read_to_string("/proc/stat").ok()?)
}

#[cfg(not(any(windows, target_os = "linux")))]
fn read_cpu_times() -> Option<CpuTimes> {
    None
}

/// CPU utilisation since the previous call (0.0 on the first call / unsupported platforms).
pub fn sample_cpu_percent() -> f32 {
    let Some(current) = read_cpu_times() else {
        return 0.0;
    };
    let mut last = LAST_SAMPLE
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let percent = last.map_or(0.0, |previous| compute_cpu_percent(previous, current));
    *last = Some(current);
    percent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_percent_between_samples() {
        assert_eq!(compute_cpu_percent((100, 200), (150, 300)), 50.0);
        assert_eq!(compute_cpu_percent((0, 0), (0, 0)), 0.0);
        assert_eq!(compute_cpu_percent((0, 100), (100, 100)), 0.0);
        assert_eq!(compute_cpu_percent((0, 0), (0, 100)), 100.0);
    }

    #[test]
    fn test_proc_stat_parsing() {
        let sample = "cpu  10 0 10 70 10 0 0 0 0 0\ncpu0 1 1 1 1";
        assert_eq!(parse_proc_stat_line(sample), Some((80, 100)));
        assert_eq!(parse_proc_stat_line("garbage"), None);
    }

    #[test]
    fn test_live_sampling_is_bounded() {
        let _ = sample_cpu_percent();
        let percent = sample_cpu_percent();
        assert!((0.0..=100.0).contains(&percent));
    }
}
