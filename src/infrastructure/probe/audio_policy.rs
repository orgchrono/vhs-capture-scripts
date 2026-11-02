//! Multi-Window Audio Signal Sampling & Layout Policy Detection (`probe/audio_policy.rs`).

use std::path::Path;
use crate::toolchain::create_silent_command;

/// Samples audio across representative windows to automatically detect channel layout and recommend channel policy.
pub fn detect_audio_policy(
    input_path: &str,
    start_sec: f64,
    duration_sec: f64,
    ffmpeg_binary: &str,
) -> crate::domain::pipeline::AudioChannelPolicy {
    let mut offsets = Vec::new();
    if duration_sec > 30.0 {
        // Multi-window sampling: 15% (early after head/leader), 50% (middle), 80% (late)
        offsets.push((start_sec + duration_sec * 0.15).max(start_sec));
        offsets.push((start_sec + duration_sec * 0.50).max(start_sec));
        offsets.push((start_sec + duration_sec * 0.80).max(start_sec));
    } else {
        offsets.push(start_sec);
    }

    let mut all_samples = Vec::new();
    for offset in offsets {
        let mut cmd = create_silent_command(Path::new(ffmpeg_binary));
        let ss_str = format!("{offset:.3}");
        cmd.args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            &ss_str,
            "-t",
            "2",
            "-i",
            input_path,
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-f",
            "f32le",
            "pipe:1",
        ]);

        if let Ok(output) = cmd.output() {
            let bytes = output.stdout;
            if bytes.len() >= 8 {
                let samples: Vec<f32> = bytes
                    .chunks_exact(4)
                    .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                    .collect();
                all_samples.extend(samples);
            }
        }
    }

    if all_samples.is_empty() {
        return crate::domain::pipeline::AudioChannelPolicy::Stereo;
    }

    let report = crate::domain::audio::analyze_interleaved_stereo(&all_samples);
    if report.detected_layout == crate::domain::audio::AudioChannelLayout::DualMono {
        return crate::domain::pipeline::AudioChannelPolicy::MonoSum;
    }
    match report.recommended_action {
        crate::domain::audio::AudioRepairAction::DuplicateLeftToRight => {
            crate::domain::pipeline::AudioChannelPolicy::MonoLeft
        }
        crate::domain::audio::AudioRepairAction::DuplicateRightToLeft => {
            crate::domain::pipeline::AudioChannelPolicy::MonoRight
        }
        _ => crate::domain::pipeline::AudioChannelPolicy::Stereo,
    }
}
