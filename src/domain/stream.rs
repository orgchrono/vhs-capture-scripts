//! Pure Functional Real-Time Streaming Frame Accumulator & TBC Frame-Hold Tracker.
//!
//! Models deterministic frame-by-frame stream metrics, mean luma sampling,
//! dropout streak classification, and TBC frame-hold actions (kept, frozen, dropped).

use crate::models::constants::{
    STREAM_PROXY_HEIGHT_PX, STREAM_PROXY_JPEG_QUALITY, STREAM_PROXY_WIDTH_PX,
};
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

/// Target display mode for the live MJPEG preview stream proxy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamProxyMode {
    Raw,
    Split,
    Processed,
}

impl StreamProxyMode {
    #[must_use]
    pub fn from_str_opt(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "raw" => Self::Raw,
            "processed" => Self::Processed,
            _ => Self::Split,
        }
    }
}

/// Specifications for launching a background FFmpeg MJPEG streaming proxy.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StreamProxySpec {
    pub source_path: Option<String>,
    pub restored_master_path: Option<String>,
    pub mode: StreamProxyMode,
    pub fps: u32,
    pub timestamp_sec: f64,
}

/// Pure compiler for FFmpeg command-line arguments generating an MJPEG multipart video stream (`pipe:1`).
#[must_use]
pub fn build_stream_proxy_ffmpeg_args(spec: &StreamProxySpec, ffmpeg_bin: &str) -> Vec<String> {
    let fps_val = spec.fps.clamp(1, 60);
    let mut cmd = vec![
        ffmpeg_bin.to_string(),
        "-hide_banner".to_string(),
        "-loglevel".to_string(),
        "error".to_string(),
    ];

    if let Some(ref source) = spec.source_path {
        if spec.timestamp_sec > 0.05 {
            cmd.push("-ss".to_string());
            cmd.push(format!("{:.3}", spec.timestamp_sec));
        }

        cmd.extend(vec![
            "-re".to_string(),
            "-stream_loop".to_string(),
            "-1".to_string(),
            "-i".to_string(),
            source.clone(),
        ]);

        match spec.mode {
            StreamProxyMode::Raw => {
                cmd.extend(vec![
                    "-vf".to_string(),
                    format!("scale={STREAM_PROXY_WIDTH_PX}:{STREAM_PROXY_HEIGHT_PX}:force_original_aspect_ratio=decrease,fps={fps_val}"),
                ]);
            }
            StreamProxyMode::Processed => {
                cmd.extend(vec![
                    "-vf".to_string(),
                    format!("bwdif=mode=1:parity=-1:deint=1,hqdn3d=4.0:3.0:6.0:4.5,chromashift=cbh=2:cbv=1:crh=2:crv=1,unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.12:brightness=0.01:saturation=1.18,scale={STREAM_PROXY_WIDTH_PX}:{STREAM_PROXY_HEIGHT_PX}:force_original_aspect_ratio=decrease,fps={fps_val}"),
                ]);
            }
            StreamProxyMode::Split => {
                cmd.extend(vec![
                    "-filter_complex".to_string(),
                    format!("[0:v]split=2[raw_in][proc_in];[raw_in]scale={STREAM_PROXY_WIDTH_PX}:{STREAM_PROXY_HEIGHT_PX}:force_original_aspect_ratio=decrease,fps={fps_val}[raw_out];[proc_in]bwdif=mode=1:parity=-1:deint=1,hqdn3d=4.0:3.0:6.0:4.5,chromashift=cbh=2:cbv=1:crh=2:crv=1,unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.12:brightness=0.01:saturation=1.18,scale={STREAM_PROXY_WIDTH_PX}:{STREAM_PROXY_HEIGHT_PX}:force_original_aspect_ratio=decrease,fps={fps_val}[proc_out];[raw_out][proc_out]hstack=inputs=2[out]"),
                    "-map".to_string(),
                    "[out]".to_string(),
                ]);
            }
        }
    } else {
        // Fallback test pattern for UI preview when no source tape is loaded
        cmd.extend(vec![
            "-re".to_string(),
            "-f".to_string(),
            "lavfi".to_string(),
        ]);
        match spec.mode {
            StreamProxyMode::Raw => {
                cmd.extend(vec![
                    "-i".to_string(),
                    format!("smptebars=size={STREAM_PROXY_WIDTH_PX}x{STREAM_PROXY_HEIGHT_PX}:rate={fps_val},noise=c0s=18:allf=t+u,tinterlace=mode=interleave_top"),
                ]);
            }
            StreamProxyMode::Split => {
                cmd.extend(vec![
                    "-i".to_string(),
                    format!("smptebars=size={STREAM_PROXY_WIDTH_PX}x{STREAM_PROXY_HEIGHT_PX}:rate={fps_val}"),
                    "-f".to_string(),
                    "lavfi".to_string(),
                    "-i".to_string(),
                    format!("smptebars=size={STREAM_PROXY_WIDTH_PX}x{STREAM_PROXY_HEIGHT_PX}:rate={fps_val}"),
                    "-filter_complex".to_string(),
                    format!("[0:v]scale={STREAM_PROXY_WIDTH_PX}:{STREAM_PROXY_HEIGHT_PX},noise=c0s=18:allf=t+u[raw_out];[1:v]scale={STREAM_PROXY_WIDTH_PX}:{STREAM_PROXY_HEIGHT_PX}[proc_out];[raw_out][proc_out]hstack=inputs=2[out]"),
                    "-map".to_string(),
                    "[out]".to_string(),
                ]);
            }
            StreamProxyMode::Processed => {
                cmd.extend(vec![
                    "-i".to_string(),
                    format!("smptebars=size={STREAM_PROXY_WIDTH_PX}x{STREAM_PROXY_HEIGHT_PX}:rate={fps_val}"),
                ]);
            }
        }
    }

    cmd.extend(vec![
        "-c:v".to_string(),
        "mjpeg".to_string(),
        "-q:v".to_string(),
        STREAM_PROXY_JPEG_QUALITY.to_string(),
        "-f".to_string(),
        "mpjpeg".to_string(),
        "-boundary_tag".to_string(),
        "frame".to_string(),
        "pipe:1".to_string(),
    ]);

    cmd
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

    #[test]
    fn test_build_stream_proxy_ffmpeg_args_fallback_patterns() {
        let spec_raw = StreamProxySpec {
            source_path: None,
            restored_master_path: None,
            mode: StreamProxyMode::Raw,
            fps: 15,
            timestamp_sec: 0.0,
        };
        let args_raw = build_stream_proxy_ffmpeg_args(&spec_raw, "ffmpeg");
        assert!(args_raw.contains(&"smptebars=size=640x360:rate=15,noise=c0s=18:allf=t+u,tinterlace=mode=interleave_top".to_string()));
        assert_eq!(args_raw.last().unwrap(), "pipe:1");

        let spec_split = StreamProxySpec {
            source_path: None,
            restored_master_path: None,
            mode: StreamProxyMode::Split,
            fps: 15,
            timestamp_sec: 0.0,
        };
        let args_split = build_stream_proxy_ffmpeg_args(&spec_split, "ffmpeg");
        assert!(args_split.contains(&"hstack=inputs=2[out]".to_string()) || args_split.iter().any(|a| a.contains("hstack=inputs=2")));

        let spec_proc = StreamProxySpec {
            source_path: None,
            restored_master_path: None,
            mode: StreamProxyMode::Processed,
            fps: 20,
            timestamp_sec: 0.0,
        };
        let args_proc = build_stream_proxy_ffmpeg_args(&spec_proc, "ffmpeg");
        assert!(args_proc.contains(&"smptebars=size=640x360:rate=20".to_string()));
    }

    #[test]
    fn test_build_stream_proxy_ffmpeg_args_source_modes() {
        let spec = StreamProxySpec {
            source_path: Some("media/raw/tape1.mp4".to_string()),
            restored_master_path: None,
            mode: StreamProxyMode::Split,
            fps: 15,
            timestamp_sec: 42.5,
        };
        let args = build_stream_proxy_ffmpeg_args(&spec, "ffmpeg");
        assert_eq!(args[0], "ffmpeg");
        assert_eq!(args[4], "-ss");
        assert_eq!(args[5], "42.500");
        assert_eq!(args[9], "-i");
        assert_eq!(args[10], "media/raw/tape1.mp4");
        assert!(args.iter().any(|a| a.contains("split=2[raw_in][proc_in]")));

        let spec_master = StreamProxySpec {
            source_path: Some("media/raw/tape1.mp4".to_string()),
            restored_master_path: Some("media/restored/tape1_restored.mp4".to_string()),
            mode: StreamProxyMode::Split,
            fps: 15,
            timestamp_sec: 10.0,
        };
        let args_master = build_stream_proxy_ffmpeg_args(&spec_master, "ffmpeg");
        assert!(args_master.contains(&"media/raw/tape1.mp4".to_string()));
        assert!(args_master.iter().any(|a| a.contains("split=2[raw_in][proc_in]")));
    }
}
