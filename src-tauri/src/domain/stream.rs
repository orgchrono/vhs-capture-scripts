//! Pure Functional Real-Time Streaming Frame Accumulator & TBC Frame-Hold Tracker.
//!
//! Models deterministic frame-by-frame stream metrics, mean luma sampling,
//! dropout streak classification, and TBC frame-hold actions (kept, frozen, dropped).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamProcessingMode {
    Passthrough,
    Freeze,
    Drop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrameAction {
    Kept,
    Frozen,
    Dropped,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct StreamState {
    pub total_frames: u64,
    pub kept_frames: u64,
    pub frozen_frames: u64,
    pub dropped_frames: u64,
    pub bad_streak: u64,
    pub is_stream_broken: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameStepResult {
    pub state: StreamState,
    pub action: FrameAction,
    pub mean_luma: f32,
    pub is_bad: bool,
    pub has_output_frame: bool,
}

/// Pure computation of mean luma across planar Y buffer using stride step.
#[must_use]
pub fn compute_mean_luma(y_plane: &[u8], stride: usize) -> f32 {
    if y_plane.is_empty() {
        return 0.0;
    }
    let step = stride.max(1);
    let mut sum: u64 = 0;
    let mut count: u64 = 0;

    for i in (0..y_plane.len()).step_by(step) {
        sum += y_plane[i] as u64;
        count += 1;
    }

    if count == 0 {
        0.0
    } else {
        (sum as f32) / (count as f32)
    }
}

/// Pure functional step processor for incoming frame buffers.
#[must_use]
pub fn step_stream_frame(
    mut state: StreamState,
    mode: StreamProcessingMode,
    y_plane: &[u8],
    stride: usize,
    luma_threshold: f32,
    has_last_good_frame: bool,
    streak_break_limit: u64,
) -> FrameStepResult {
    state.total_frames += 1;
    let mean_luma = compute_mean_luma(y_plane, stride);
    let is_bad = mean_luma <= luma_threshold;

    let (action, has_output) = match mode {
        StreamProcessingMode::Passthrough => {
            state.kept_frames += 1;
            (FrameAction::Kept, true)
        }
        StreamProcessingMode::Freeze if is_bad => {
            if has_last_good_frame {
                state.frozen_frames += 1;
                (FrameAction::Frozen, true)
            } else {
                state.dropped_frames += 1;
                (FrameAction::Dropped, false)
            }
        }
        StreamProcessingMode::Drop if is_bad => {
            state.dropped_frames += 1;
            (FrameAction::Dropped, false)
        }
        _ => {
            // Good frame in Freeze or Drop mode
            state.kept_frames += 1;
            (FrameAction::Kept, true)
        }
    };

    if is_bad {
        state.bad_streak += 1;
        if state.bad_streak >= streak_break_limit {
            state.is_stream_broken = true;
        }
    } else {
        state.bad_streak = 0;
    }

    FrameStepResult {
        state,
        action,
        mean_luma,
        is_bad,
        has_output_frame: has_output,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_mean_luma() {
        let y = vec![100_u8, 200, 100, 200];
        assert_eq!(compute_mean_luma(&y, 1), 150.0);
        assert_eq!(compute_mean_luma(&y, 2), 100.0);
    }

    #[test]
    fn test_step_stream_frame_good_frame() {
        let state = StreamState::default();
        let y = vec![128_u8; 100];
        let res = step_stream_frame(state, StreamProcessingMode::Freeze, &y, 1, 16.0, false, 30);
        assert_eq!(res.action, FrameAction::Kept);
        assert_eq!(res.state.total_frames, 1);
        assert_eq!(res.state.kept_frames, 1);
        assert_eq!(res.state.frozen_frames, 0);
        assert!(!res.is_bad);
        assert!(res.has_output_frame);
    }

    #[test]
    fn test_step_stream_frame_bad_frame_with_hold() {
        let state = StreamState::default();
        let black_y = vec![10_u8; 100];
        let res = step_stream_frame(state, StreamProcessingMode::Freeze, &black_y, 1, 16.0, true, 30);
        assert_eq!(res.action, FrameAction::Frozen);
        assert_eq!(res.state.total_frames, 1);
        assert_eq!(res.state.frozen_frames, 1);
        assert_eq!(res.state.bad_streak, 1);
        assert!(res.is_bad);
        assert!(res.has_output_frame);
    }

    #[test]
    fn test_step_stream_frame_detects_broken_stream_streak() {
        let mut state = StreamState::default();
        let black_y = vec![5_u8; 100];
        for _ in 0..5 {
            let res = step_stream_frame(state, StreamProcessingMode::Freeze, &black_y, 1, 16.0, true, 5);
            state = res.state;
        }
        assert!(state.is_stream_broken);
        assert_eq!(state.bad_streak, 5);
    }
}
