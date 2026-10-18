//! Pure Functional Time Base Corrector (TBC) Signal Classifier & Frame-Hold Engine.
//!
//! Replaces procedural Python frame-looping (`stream_runner.py`) with zero-allocation,
//! cache-friendly Rust slice iterators over UYVY422 broadcast video frames.

use serde::{Deserialize, Serialize};

/// Canonical broadcast signal thresholds matching `src/vhs_studio/core/constants.py`.
pub const LUMA_STRIDE_STEP: usize = 64;
pub const BLACK_LUMA_THRESHOLD: f32 = 24.0;
pub const BLACK_STD_DEV_THRESHOLD: f32 = 12.0;
pub const BLUE_CHROMA_U_MIN: f32 = 155.0;
pub const BLUE_CHROMA_V_MAX: f32 = 115.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalState {
    ActiveSignal,
    Blackout,
    BlueScreenDropout,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct FrameSignalMetrics {
    pub mean_luma_y: f32,
    pub luma_std_dev: f32,
    pub mean_chroma_u: f32,
    pub mean_chroma_v: f32,
    pub classification: SignalState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TbcHoldCounters {
    pub processed_frames: u64,
    pub held_dropout_frames: u64,
    pub dropped_frames: u64,
}

impl TbcHoldCounters {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            processed_frames: 0,
            held_dropout_frames: 0,
            dropped_frames: 0,
        }
    }
}

impl Default for TbcHoldCounters {
    fn default() -> Self {
        Self::new()
    }
}

/// Pure function that classifies a raw UYVY422 frame buffer (`[U0, Y0, V0, Y1]`)
/// using strided zero-copy iterator folding.
#[must_use]
pub fn classify_uyvy422_frame(frame: &[u8], stride_macropixels: usize) -> FrameSignalMetrics {
    let step = stride_macropixels.max(1);
    let macropixels: Vec<&[u8]> = frame.chunks_exact(4).step_by(step).collect();

    if macropixels.is_empty() {
        return FrameSignalMetrics {
            mean_luma_y: 0.0,
            luma_std_dev: 0.0,
            mean_chroma_u: 128.0,
            mean_chroma_v: 128.0,
            classification: SignalState::Blackout,
        };
    }

    let sample_count = macropixels.len() as f32;
    let (sum_u, sum_y, sum_v, sum_y_sq) = macropixels.iter().fold(
        (0.0_f32, 0.0_f32, 0.0_f32, 0.0_f32),
        |(acc_u, acc_y, acc_v, acc_y2), mp| {
            let u = f32::from(mp[0]);
            let y = (f32::from(mp[1]) + f32::from(mp[3])) * 0.5;
            let v = f32::from(mp[2]);
            (acc_u + u, acc_y + y, acc_v + v, acc_y2 + (y * y))
        },
    );

    let mean_u = sum_u / sample_count;
    let mean_y = sum_y / sample_count;
    let mean_v = sum_v / sample_count;
    let variance_y = ((sum_y_sq / sample_count) - (mean_y * mean_y)).max(0.0);
    let std_dev_y = variance_y.sqrt();

    let classification = if mean_u >= BLUE_CHROMA_U_MIN && mean_v <= BLUE_CHROMA_V_MAX && std_dev_y < BLACK_STD_DEV_THRESHOLD {
        SignalState::BlueScreenDropout
    } else if mean_y <= BLACK_LUMA_THRESHOLD && std_dev_y <= BLACK_STD_DEV_THRESHOLD {
        SignalState::Blackout
    } else {
        SignalState::ActiveSignal
    };

    FrameSignalMetrics {
        mean_luma_y: mean_y,
        luma_std_dev: std_dev_y,
        mean_chroma_u: mean_u,
        mean_chroma_v: mean_v,
        classification,
    }
}

/// Pure functional state transition for Frame-Hold TBC dropout protection.
/// Given the current `counters`, `current_frame`, and optional `last_good_frame`,
/// returns the updated immutable `TbcHoldCounters`, the chosen output slice, and metrics.
#[must_use]
pub fn evaluate_tbc_frame<'a>(
    counters: TbcHoldCounters,
    current_frame: &'a [u8],
    last_good_frame: Option<&'a [u8]>,
) -> (TbcHoldCounters, &'a [u8], FrameSignalMetrics) {
    let metrics = classify_uyvy422_frame(current_frame, LUMA_STRIDE_STEP);
    let next_processed = counters.processed_frames + 1;

    match (metrics.classification, last_good_frame) {
        (SignalState::ActiveSignal, _) => (
            TbcHoldCounters {
                processed_frames: next_processed,
                ..counters
            },
            current_frame,
            metrics,
        ),
        (SignalState::Blackout | SignalState::BlueScreenDropout, Some(good_frame))
            if good_frame.len() == current_frame.len() =>
        {
            (
                TbcHoldCounters {
                    processed_frames: next_processed,
                    held_dropout_frames: counters.held_dropout_frames + 1,
                    ..counters
                },
                good_frame,
                metrics,
            )
        }
        (SignalState::Blackout | SignalState::BlueScreenDropout, _) => (
            TbcHoldCounters {
                processed_frames: next_processed,
                dropped_frames: counters.dropped_frames + 1,
                ..counters
            },
            current_frame,
            metrics,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_blackout_frame() {
        let blackout = vec![128_u8, 16_u8, 128_u8, 16_u8].repeat(1024);
        let metrics = classify_uyvy422_frame(&blackout, 4);
        assert_eq!(metrics.classification, SignalState::Blackout);
    }

    #[test]
    fn classifies_vcr_bluescreen_dropout() {
        // High U (blue chroma >= 155), low V (<= 115), flat luma variance
        let bluescreen = vec![200_u8, 70_u8, 90_u8, 70_u8].repeat(1024);
        let metrics = classify_uyvy422_frame(&bluescreen, 4);
        assert_eq!(metrics.classification, SignalState::BlueScreenDropout);
    }

    #[test]
    fn classifies_active_broadcast_signal_and_holds_on_dropout() {
        let mut active = Vec::with_capacity(4096);
        for i in 0..1024_u32 {
            let y0 = ((i * 37) % 200 + 30) as u8;
            let y1 = ((i * 73) % 200 + 30) as u8;
            active.extend_from_slice(&[128, y0, 128, y1]);
        }
        let blackout = vec![128_u8, 16_u8, 128_u8, 16_u8].repeat(1024);

        let counters = TbcHoldCounters::new();
        let (c1, out1, m1) = evaluate_tbc_frame(counters, &active, None);
        assert_eq!(m1.classification, SignalState::ActiveSignal);
        assert_eq!(c1.processed_frames, 1);
        assert_eq!(c1.held_dropout_frames, 0);
        assert_eq!(out1, active.as_slice());

        // Next frame is a VCR blackout dropout -> TBC holds `active` frame
        let (c2, out2, m2) = evaluate_tbc_frame(c1, &blackout, Some(&active));
        assert_eq!(m2.classification, SignalState::Blackout);
        assert_eq!(c2.processed_frames, 2);
        assert_eq!(c2.held_dropout_frames, 1);
        assert_eq!(out2, active.as_slice());
    }
}
