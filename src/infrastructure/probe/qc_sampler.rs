//! Video Frame QC Sampling & Multi-Point Broadcast Assessment (`probe/qc_sampler.rs`).

use std::path::Path;
use crate::toolchain::create_silent_command;
use super::runner::probe_media_file;

/// Samples video frames using FFmpeg to evaluate physical tape signal and broadcast compliance.
pub fn assess_media_file_qc(
    file_path: &str,
    ffprobe_binary: &str,
    ffmpeg_binary: &str,
) -> Result<crate::domain::qc::FileQcAssessment, String> {
    let probe = probe_media_file(file_path, ffprobe_binary)?;
    if probe.width == 0 || probe.height == 0 {
        return Err("Invalid probe dimensions".to_string());
    }

    let w = probe.width as usize;
    let h = probe.height as usize;
    let y_size = w * h;
    let u_size = (w / 2) * (h / 2);
    let v_size = u_size;
    let frame_size = y_size + u_size + v_size;

    let mut reports = Vec::new();
    let mut black_leader_count = 0;
    let mut past_leader = false;

    // Fast multi-point sampling with input seeking (-ss before -i) avoiding linear file decoding
    let sample_timestamps: Vec<f64> = if probe.duration <= 2.0 {
        vec![0.0]
    } else if probe.duration <= 10.0 {
        vec![0.5, probe.duration * 0.5, (probe.duration - 0.5).max(0.5)]
    } else {
        vec![
            0.5,
            (probe.duration * 0.1).max(1.0),
            (probe.duration * 0.25).max(2.0),
            (probe.duration * 0.5).max(3.0),
            (probe.duration * 0.75).max(4.0),
            (probe.duration - 2.0).max(5.0),
        ]
    };

    let sample_interval_sec = if !sample_timestamps.is_empty() {
        probe.duration / sample_timestamps.len() as f64
    } else {
        1.0
    };

    for ts in &sample_timestamps {
        let mut cmd = create_silent_command(Path::new(ffmpeg_binary));
        cmd.args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            &format!("{ts:.3}"),
            "-i",
            file_path,
            "-vframes",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "yuv420p",
            "pipe:1",
        ]);

        if let Ok(output) = cmd.output() {
            let stdout = output.stdout;
            if frame_size > 0 && stdout.len() >= frame_size {
                let y_plane = &stdout[..y_size];
                let u_plane = &stdout[y_size..y_size + u_size];
                let v_plane = &stdout[y_size + u_size..y_size + u_size + v_size];

                let rep = crate::domain::qc::inspect_frame_qc(y_plane, u_plane, v_plane, w, h);
                if !past_leader {
                    if rep.luma.mean_luma < 20.0 {
                        black_leader_count += 1;
                    } else {
                        past_leader = true;
                    }
                }
                reports.push(rep);
            }
        }
    }

    let black_leader_sec = (black_leader_count as f64 * sample_interval_sec).min(probe.duration);

    Ok(crate::domain::qc::aggregate_frame_qc_reports(
        &reports,
        file_path.to_string(),
        probe.width,
        probe.height,
        probe.duration,
        probe.total_frames,
        probe.standard,
        probe.is_interlaced,
        black_leader_sec,
    ))
}
