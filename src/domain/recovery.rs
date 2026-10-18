//! VHS Studio Pro - Pure Functional Checkpoint Recovery & Job State Machine (`recovery.rs`).
//!
//! Provides deterministic validation of restoration checkpoints, progress computation,
//! and resumption state transitions without side-effects.

use serde::{Deserialize, Serialize};

/// Restoration job lifecycle execution state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum JobLifecycleStatus {
    #[default]
    Standby,
    InProgress,
    Paused,
    Aborted,
    Completed,
}

/// Raw checkpoint schema serialized to `.checkpoint.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointData {
    pub status: String,
    pub source: Option<String>,
    pub destination: Option<String>,
    pub total_frames: Option<u64>,
    pub kept_frames: Option<u64>,
    pub frozen_frames: Option<u64>,
    pub dropped_frames: Option<u64>,
    pub total_expected_frames: Option<u64>,
    pub elapsed_seconds: Option<f64>,
    pub fps: Option<f64>,
}

/// Diagnostic descriptor of an interrupted or in-progress restoration job.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JobRecoveryAssessment {
    pub job_id: String,
    pub status: JobLifecycleStatus,
    pub processed_frames: u64,
    pub total_expected_frames: u64,
    pub progress_percent: f64,
    pub elapsed_seconds: f64,
    pub fps: f64,
    pub can_resume: bool,
}

/// Evaluates progress percentage from frame counts.
#[must_use]
pub fn compute_progress_percent(processed_frames: u64, total_expected: u64) -> f64 {
    if total_expected == 0 || processed_frames == 0 {
        0.0
    } else {
        ((processed_frames as f64 / total_expected as f64) * 100.0).clamp(0.0, 100.0)
    }
}

/// Calculates the frame-accurate resumption timestamp offset.
#[must_use]
pub fn compute_resumption_start_sec(base_start_sec: f64, processed_frames: u64, fps: f64) -> f64 {
    if fps <= 0.0 {
        base_start_sec
    } else {
        base_start_sec + (processed_frames as f64 / fps)
    }
}

/// Pure functional parser and assessor of checkpoint data.
#[must_use]
pub fn assess_checkpoint(
    job_id: String,
    data: &CheckpointData,
    source_exists: bool,
) -> JobRecoveryAssessment {
    let status = match data.status.to_ascii_lowercase().as_str() {
        "completed" => JobLifecycleStatus::Completed,
        "paused" => JobLifecycleStatus::Paused,
        "aborted" => JobLifecycleStatus::Aborted,
        "in_progress" => JobLifecycleStatus::InProgress,
        _ => JobLifecycleStatus::Standby,
    };

    let kept = data.kept_frames.unwrap_or(0);
    let frozen = data.frozen_frames.unwrap_or(0);
    let total_frames = data.total_frames.unwrap_or(0);
    let processed = if kept + frozen > 0 {
        kept + frozen
    } else {
        total_frames
    };

    let total_expected = data.total_expected_frames.unwrap_or(0);
    let progress = compute_progress_percent(processed, total_expected);
    let elapsed = data.elapsed_seconds.unwrap_or(0.0);
    let fps = data.fps.unwrap_or(29.97);
    let can_resume = source_exists && status != JobLifecycleStatus::Completed && processed > 0;

    JobRecoveryAssessment {
        job_id,
        status,
        processed_frames: processed,
        total_expected_frames: total_expected,
        progress_percent: (progress * 10.0).round() / 10.0,
        elapsed_seconds: (elapsed * 10.0).round() / 10.0,
        fps: (fps * 100.0).round() / 100.0,
        can_resume,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_progress_percent_handles_zero_and_clamp() {
        assert_eq!(compute_progress_percent(0, 1000), 0.0);
        assert_eq!(compute_progress_percent(500, 1000), 50.0);
        assert_eq!(compute_progress_percent(1500, 1000), 100.0);
        assert_eq!(compute_progress_percent(500, 0), 0.0);
    }

    #[test]
    fn test_compute_resumption_start_sec_accurate() {
        let resume = compute_resumption_start_sec(66.5, 3000, 60.0);
        assert!((resume - 116.5).abs() < 1e-4);
    }

    #[test]
    fn test_assess_checkpoint_in_progress() {
        let data = CheckpointData {
            status: "in_progress".to_string(),
            source: Some("tape.mkv".to_string()),
            destination: Some("tape_restored.mp4".to_string()),
            total_frames: Some(1800),
            kept_frames: Some(1750),
            frozen_frames: Some(50),
            dropped_frames: Some(0),
            total_expected_frames: Some(3600),
            elapsed_seconds: Some(60.2),
            fps: Some(60.0),
        };

        let assess = assess_checkpoint("tape".to_string(), &data, true);
        assert_eq!(assess.status, JobLifecycleStatus::InProgress);
        assert_eq!(assess.processed_frames, 1800);
        assert_eq!(assess.progress_percent, 50.0);
        assert!(assess.can_resume);
    }

    #[test]
    fn test_assess_checkpoint_completed_cannot_resume() {
        let data = CheckpointData {
            status: "completed".to_string(),
            source: Some("tape.mkv".to_string()),
            destination: Some("tape_restored.mp4".to_string()),
            total_frames: Some(3600),
            kept_frames: Some(3600),
            frozen_frames: Some(0),
            dropped_frames: Some(0),
            total_expected_frames: Some(3600),
            elapsed_seconds: Some(120.0),
            fps: Some(60.0),
        };

        let assess = assess_checkpoint("tape".to_string(), &data, true);
        assert_eq!(assess.status, JobLifecycleStatus::Completed);
        assert!(!assess.can_resume);
    }
}
