//! Pure Functional Audio Analysis & EBU R128 / ATSC A/85 Compliance Engine.
//!
//! Replaces procedural audio probing and channel balancing logic with zero-allocation,
//! memory-safe Rust functions operating on raw PCM audio buffers.

use serde::{Deserialize, Serialize};

/// Canonical broadcast audio standards thresholds.
pub const EBU_R128_TARGET_LUFS: f32 = -23.0;
pub const ATSC_A85_TARGET_LKFS: f32 = -24.0;
pub const MAX_PERMITTED_TRUE_PEAK_DBFS: f32 = -1.0;

/// Silence detection thresholds in dBFS.
pub const CHANNEL_SILENCE_THRESHOLD_DBFS: f32 = -55.0;
pub const CHANNEL_ACTIVE_MIN_DBFS: f32 = -45.0;
pub const DUAL_MONO_DELTA_MAX_DB: f32 = 0.8;

/// Inferred VHS audio channel layout configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioChannelLayout {
    Stereo,
    DualMono,
    MonoLeftOnly,
    MonoRightOnly,
    MutedOrSilent,
}

/// Recommended channel repair action for restoration pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioRepairAction {
    Passthrough,
    DuplicateLeftToRight,
    DuplicateRightToLeft,
    AttenuateGain,
}

/// RMS energy and peak metrics per channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelMetrics {
    pub rms_dbfs: f32,
    pub peak_dbfs: f32,
    pub is_silent: bool,
}

/// Comprehensive stereo audio assessment report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AudioComplianceReport {
    pub left: ChannelMetrics,
    pub right: ChannelMetrics,
    pub detected_layout: AudioChannelLayout,
    pub recommended_action: AudioRepairAction,
    pub peak_exceeds_broadcast_limit: bool,
}

/// Pure function converting raw linear amplitude to decibels relative to Full Scale (dBFS).
#[inline]
#[must_use]
pub fn linear_to_dbfs(linear: f32) -> f32 {
    if linear <= 1e-9 {
        -100.0
    } else {
        (20.0 * linear.log10()).max(-100.0)
    }
}

/// Pure function computing RMS (Root Mean Square) energy and true peak from a slice of normalized f32 PCM samples ([-1.0, 1.0]).
#[must_use]
pub fn compute_channel_metrics(samples: &[f32]) -> ChannelMetrics {
    if samples.is_empty() {
        return ChannelMetrics {
            rms_dbfs: -100.0,
            peak_dbfs: -100.0,
            is_silent: true,
        };
    }

    let mut sum_sq: f64 = 0.0;
    let mut max_abs: f32 = 0.0;

    for &sample in samples {
        let abs_val = sample.abs();
        if abs_val > max_abs {
            max_abs = abs_val;
        }
        let s = f64::from(sample);
        sum_sq += s * s;
    }

    let n = samples.len() as f64;
    let rms_linear = (sum_sq / n).sqrt() as f32;
    let rms_db = linear_to_dbfs(rms_linear);
    let peak_db = linear_to_dbfs(max_abs);
    let is_silent = rms_db < CHANNEL_SILENCE_THRESHOLD_DBFS;

    ChannelMetrics {
        rms_dbfs: rms_db,
        peak_dbfs: peak_db,
        is_silent,
    }
}

/// Pure function analyzing interleaved 2-channel stereo PCM audio (`[L0, R0, L1, R1, ...]`).
#[must_use]
pub fn analyze_interleaved_stereo(interleaved_samples: &[f32]) -> AudioComplianceReport {
    let frame_count = interleaved_samples.len() / 2;
    if frame_count == 0 {
        let empty = ChannelMetrics {
            rms_dbfs: -100.0,
            peak_dbfs: -100.0,
            is_silent: true,
        };
        return AudioComplianceReport {
            left: empty.clone(),
            right: empty,
            detected_layout: AudioChannelLayout::MutedOrSilent,
            recommended_action: AudioRepairAction::Passthrough,
            peak_exceeds_broadcast_limit: false,
        };
    }

    // De-interleave with zero allocation into pure folds
    let mut sum_sq_l: f64 = 0.0;
    let mut max_abs_l: f32 = 0.0;
    let mut sum_sq_r: f64 = 0.0;
    let mut max_abs_r: f32 = 0.0;

    for chunk in interleaved_samples.chunks_exact(2) {
        let l = chunk[0];
        let r = chunk[1];

        let abs_l = l.abs();
        if abs_l > max_abs_l {
            max_abs_l = abs_l;
        }
        let sl = f64::from(l);
        sum_sq_l += sl * sl;

        let abs_r = r.abs();
        if abs_r > max_abs_r {
            max_abs_r = abs_r;
        }
        let sr = f64::from(r);
        sum_sq_r += sr * sr;
    }

    let n = frame_count as f64;
    let rms_l = linear_to_dbfs((sum_sq_l / n).sqrt() as f32);
    let peak_l = linear_to_dbfs(max_abs_l);
    let left_metrics = ChannelMetrics {
        rms_dbfs: rms_l,
        peak_dbfs: peak_l,
        is_silent: rms_l < CHANNEL_SILENCE_THRESHOLD_DBFS,
    };

    let rms_r = linear_to_dbfs((sum_sq_r / n).sqrt() as f32);
    let peak_r = linear_to_dbfs(max_abs_r);
    let right_metrics = ChannelMetrics {
        rms_dbfs: rms_r,
        peak_dbfs: peak_r,
        is_silent: rms_r < CHANNEL_SILENCE_THRESHOLD_DBFS,
    };

    // Classify channel layout
    let (detected_layout, recommended_action) = if left_metrics.is_silent && right_metrics.is_silent {
        (AudioChannelLayout::MutedOrSilent, AudioRepairAction::Passthrough)
    } else if left_metrics.is_silent && right_metrics.rms_dbfs > CHANNEL_ACTIVE_MIN_DBFS {
        (AudioChannelLayout::MonoRightOnly, AudioRepairAction::DuplicateRightToLeft)
    } else if right_metrics.is_silent && left_metrics.rms_dbfs > CHANNEL_ACTIVE_MIN_DBFS {
        (AudioChannelLayout::MonoLeftOnly, AudioRepairAction::DuplicateLeftToRight)
    } else if (left_metrics.rms_dbfs - right_metrics.rms_dbfs).abs() <= DUAL_MONO_DELTA_MAX_DB {
        (AudioChannelLayout::DualMono, AudioRepairAction::Passthrough)
    } else {
        (AudioChannelLayout::Stereo, AudioRepairAction::Passthrough)
    };

    let peak_exceeds = peak_l > MAX_PERMITTED_TRUE_PEAK_DBFS || peak_r > MAX_PERMITTED_TRUE_PEAK_DBFS;

    AudioComplianceReport {
        left: left_metrics,
        right: right_metrics,
        detected_layout,
        recommended_action,
        peak_exceeds_broadcast_limit: peak_exceeds,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_mono_vcr_deck_muted_right_track() {
        // Interleaved: Left channel has active speech/audio (-20 dBFS ~ 0.1 amplitude)
        // Right channel is tape hiss / muted (-60 dBFS ~ 0.001 amplitude)
        let frame_count = 1000;
        let mut samples = Vec::with_capacity(frame_count * 2);
        for _ in 0..frame_count {
            samples.push(0.1f32);
            samples.push(0.0005f32);
        }

        let report = analyze_interleaved_stereo(&samples);
        assert_eq!(report.detected_layout, AudioChannelLayout::MonoLeftOnly);
        assert_eq!(report.recommended_action, AudioRepairAction::DuplicateLeftToRight);
        assert!(!report.peak_exceeds_broadcast_limit);
    }

    #[test]
    fn detects_dual_mono_identical_channels() {
        let frame_count = 500;
        let mut samples = Vec::with_capacity(frame_count * 2);
        for i in 0..frame_count {
            let val = ((i as f32) * 0.01).sin() * 0.25;
            samples.push(val);
            samples.push(val);
        }

        let report = analyze_interleaved_stereo(&samples);
        assert_eq!(report.detected_layout, AudioChannelLayout::DualMono);
        assert_eq!(report.recommended_action, AudioRepairAction::Passthrough);
    }

    #[test]
    fn flags_illegal_broadcast_true_peak_overflow() {
        // Broadcast standard: Peak must not exceed -1.0 dBFS (approx 0.891 linear)
        // Clipping frame with 1.0 full scale
        let samples = vec![1.0f32, 1.0f32, 0.5f32, 0.5f32];
        let report = analyze_interleaved_stereo(&samples);
        assert!(report.peak_exceeds_broadcast_limit);
        assert!(report.left.peak_dbfs > MAX_PERMITTED_TRUE_PEAK_DBFS);
    }
}
