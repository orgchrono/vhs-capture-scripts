//! Pure Functional System Preflight Check & Environment Readiness Evaluator.
//!
//! Validates operational readiness prior to starting capture or batch restoration:
//! verifies minimum disk capacity (50GB default), external binary presence (FFmpeg, OBS),
//! and generates structured readiness diagnostics.

use serde::{Deserialize, Serialize};

pub use crate::models::constants::DEFAULT_MIN_FREE_DISK_GB;
pub const BYTES_PER_GB: f64 = 1_073_741_824.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PreflightStatus {
    Pass,
    Fail,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PreflightDiagnostics {
    pub status: PreflightStatus,
    pub is_ready: bool,
    pub disk_free_gb: f64,
    pub has_sufficient_disk: bool,
    pub ffmpeg_available: bool,
    pub obs_available: bool,
    pub issues: Vec<String>,
}

/// Pure evaluation of system preflight parameters.
#[must_use]
pub fn evaluate_preflight(
    disk_free_bytes: u64,
    min_disk_gb: f64,
    ffmpeg_available: bool,
    obs_available: bool,
) -> PreflightDiagnostics {
    let mut issues: Vec<String> = Vec::new();

    if !ffmpeg_available {
        issues.push("FFmpeg executable missing or not accessible in PATH.".to_string());
    }

    if !obs_available {
        issues.push("OBS Studio executable missing or not accessible.".to_string());
    }

    let disk_free_gb = (disk_free_bytes as f64) / BYTES_PER_GB;
    let threshold = if min_disk_gb > 0.0 { min_disk_gb } else { DEFAULT_MIN_FREE_DISK_GB };
    let has_sufficient_disk = disk_free_gb >= threshold;

    if !has_sufficient_disk {
        issues.push(format!(
            "Insufficient free disk space: {:.1} GB available (minimum recommended: {:.1} GB).",
            disk_free_gb, threshold
        ));
    }

    let is_ready = issues.is_empty();
    let status = if is_ready { PreflightStatus::Pass } else { PreflightStatus::Fail };

    PreflightDiagnostics {
        status,
        is_ready,
        disk_free_gb: (disk_free_gb * 10.0).round() / 10.0,
        has_sufficient_disk,
        ffmpeg_available,
        obs_available,
        issues,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preflight_passes_with_ample_disk_and_tools() {
        let bytes_100gb = 100 * 1_073_741_824;
        let res = evaluate_preflight(bytes_100gb, 50.0, true, true);
        assert_eq!(res.status, PreflightStatus::Pass);
        assert!(res.is_ready);
        assert!(res.has_sufficient_disk);
        assert_eq!(res.disk_free_gb, 100.0);
        assert!(res.issues.is_empty());
    }

    #[test]
    fn test_preflight_fails_on_low_disk_and_missing_ffmpeg() {
        let bytes_20gb = 20 * 1_073_741_824;
        let res = evaluate_preflight(bytes_20gb, 50.0, false, true);
        assert_eq!(res.status, PreflightStatus::Fail);
        assert!(!res.is_ready);
        assert!(!res.has_sufficient_disk);
        assert!(!res.ffmpeg_available);
        assert_eq!(res.issues.len(), 2);
    }
}
