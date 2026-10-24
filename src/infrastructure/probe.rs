//! Fast Media Probe & FFprobe Parser.
//!
//! Pure functional extraction and classification of video and audio streams,
//! broadcast standards (NTSC vs PAL), interlacing field order, frame rate rationales,
//! and duration metrics from `ffprobe` JSON output.

use std::path::Path;
use serde::{Deserialize, Serialize};

use crate::toolchain::create_silent_command;

pub const DEFAULT_NTSC_FPS: f64 = 29.97002997002997;
pub const DEFAULT_PAL_FPS: f64 = 25.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawStream {
    pub index: Option<u32>,
    pub codec_type: Option<String>,
    pub codec_name: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub r_frame_rate: Option<String>,
    pub duration: Option<String>,
    pub pix_fmt: Option<String>,
    pub field_order: Option<String>,
    pub color_space: Option<String>,
    pub color_primaries: Option<String>,
    pub color_transfer: Option<String>,
    pub channels: Option<u32>,
    pub sample_rate: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawFormat {
    pub format_name: Option<String>,
    pub duration: Option<String>,
    pub size: Option<String>,
    pub bit_rate: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawFFprobeOutput {
    #[serde(default)]
    pub streams: Vec<RawStream>,
    pub format: Option<RawFormat>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaProbeResult {
    pub file_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub fps_rational: String,
    pub duration: f64,
    pub total_frames: u64,
    pub video_codec: String,
    pub audio_codec: String,
    pub audio_channels: u32,
    pub audio_sample_rate: u32,
    pub field_order: String,
    pub is_interlaced: bool,
    pub pix_fmt: String,
    pub color_space: String,
    pub color_primaries: String,
    pub color_transfer: String,
    pub format_name: String,
    pub standard: String,
}

/// Pure parser converting rational frame rate ("30000/1001", "25/1", "29.97") to floating point.
#[must_use]
pub fn parse_frame_rate_rational(r_fps: &str) -> (f64, String) {
    let trimmed = r_fps.trim();
    if trimmed.is_empty() {
        return (DEFAULT_NTSC_FPS, "30000/1001".to_string());
    }

    if let Some((num_str, den_str)) = trimmed.split_once('/') {
        let num: f64 = num_str.trim().parse().unwrap_or(30000.0);
        let den: f64 = den_str.trim().parse().unwrap_or(1001.0);
        if den > 0.0 {
            (num / den, trimmed.to_string())
        } else {
            (DEFAULT_NTSC_FPS, "30000/1001".to_string())
        }
    } else if let Ok(val) = trimmed.parse::<f64>() {
        if val > 0.0 {
            (val, trimmed.to_string())
        } else {
            (DEFAULT_NTSC_FPS, "30000/1001".to_string())
        }
    } else {
        (DEFAULT_NTSC_FPS, "30000/1001".to_string())
    }
}

/// Pure classifier determining broadcast standard (NTSC, PAL, HD, CUSTOM).
#[must_use]
pub fn classify_broadcast_standard(width: u32, height: u32, fps: f64) -> &'static str {
    if width >= 1280 || height >= 720 {
        return "HD";
    }

    let is_around_25fps = (fps - 25.0).abs() < 0.5 || (fps - 50.0).abs() < 0.5;
    let is_around_30fps = (fps - 29.97).abs() < 0.5 || (fps - 59.94).abs() < 0.5;

    let is_ntsc_dims = (height == 480 || height == 240) && (width == 720 || width == 704 || width == 640);
    let is_pal_dims = (height == 576 || height == 288) && (width == 720 || width == 704);

    if is_ntsc_dims && is_around_30fps {
        "NTSC"
    } else if is_pal_dims && is_around_25fps {
        "PAL"
    } else if height == 480 && is_around_30fps {
        "NTSC"
    } else if height == 576 && is_around_25fps {
        "PAL"
    } else {
        "CUSTOM"
    }
}

/// Pure classifier detecting if field order implies interlacing.
#[must_use]
pub fn is_interlaced_field_order(field_order: &str) -> bool {
    let lower = field_order.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "tt" | "bb" | "tb" | "bt" | "top first" | "bottom first"
    )
}

/// Pure calculation of total expected frames given duration and frame rate.
#[must_use]
pub fn calculate_expected_frames(duration_sec: f64, fps: f64) -> u64 {
    if duration_sec <= 0.0 || fps <= 0.0 {
        0
    } else {
        (duration_sec * fps).round() as u64
    }
}

/// Build standard FFprobe command line arguments for JSON metadata extraction.
#[must_use]
pub fn build_ffprobe_args(file_path: &str) -> Vec<String> {
    vec![
        "-v".to_string(),
        "error".to_string(),
        "-show_streams".to_string(),
        "-show_format".to_string(),
        "-of".to_string(),
        "json".to_string(),
        file_path.to_string(),
    ]
}

/// Parse FFprobe raw JSON string into strongly-typed `MediaProbeResult`.
pub fn parse_ffprobe_json(json_content: &str, file_path: &str) -> Result<MediaProbeResult, String> {
    let raw: RawFFprobeOutput = serde_json::from_str(json_content)
        .map_err(|e| format!("Invalid ffprobe JSON: {}", e))?;

    let v_stream = raw.streams.iter().find(|s| {
        s.codec_type
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case("video"))
            .unwrap_or(false)
    });

    let a_stream = raw.streams.iter().find(|s| {
        s.codec_type
            .as_deref()
            .map(|t| t.eq_ignore_ascii_case("audio"))
            .unwrap_or(false)
    });

    let width = v_stream.and_then(|s| s.width).unwrap_or(720);
    let height = v_stream.and_then(|s| s.height).unwrap_or(480);

    let raw_r_fps = v_stream
        .and_then(|s| s.r_frame_rate.as_deref())
        .unwrap_or("30000/1001");
    let (fps, fps_rational) = parse_frame_rate_rational(raw_r_fps);

    let mut duration: f64 = raw
        .format
        .as_ref()
        .and_then(|f| f.duration.as_deref())
        .and_then(|d| d.parse().ok())
        .unwrap_or(0.0);

    if duration <= 0.0 {
        duration = v_stream
            .and_then(|s| s.duration.as_deref())
            .and_then(|d| d.parse().ok())
            .unwrap_or(0.0);
    }

    let video_codec = v_stream
        .and_then(|s| s.codec_name.as_deref())
        .unwrap_or("unknown")
        .to_string();

    let audio_codec = a_stream
        .and_then(|s| s.codec_name.as_deref())
        .unwrap_or("none")
        .to_string();

    let audio_channels = a_stream.and_then(|s| s.channels).unwrap_or(0);
    let audio_sample_rate = a_stream
        .and_then(|s| s.sample_rate.as_deref())
        .and_then(|sr| sr.parse().ok())
        .unwrap_or(0);

    let field_order = v_stream
        .and_then(|s| s.field_order.as_deref())
        .unwrap_or("unknown")
        .to_string();

    let is_interlaced = is_interlaced_field_order(&field_order);

    let pix_fmt = v_stream
        .and_then(|s| s.pix_fmt.as_deref())
        .unwrap_or("yuv420p")
        .to_string();

    let color_space = v_stream
        .and_then(|s| s.color_space.as_deref())
        .unwrap_or("smpte170m")
        .to_string();

    let color_primaries = v_stream
        .and_then(|s| s.color_primaries.as_deref())
        .unwrap_or("smpte170m")
        .to_string();

    let color_transfer = v_stream
        .and_then(|s| s.color_transfer.as_deref())
        .unwrap_or("smpte170m")
        .to_string();

    let format_name = raw
        .format
        .as_ref()
        .and_then(|f| f.format_name.as_deref())
        .unwrap_or("")
        .to_string();

    let standard = classify_broadcast_standard(width, height, fps).to_string();
    let total_frames = calculate_expected_frames(duration, fps);

    Ok(MediaProbeResult {
        file_path: file_path.to_string(),
        width,
        height,
        fps,
        fps_rational,
        duration,
        total_frames,
        video_codec,
        audio_codec,
        audio_channels,
        audio_sample_rate,
        field_order,
        is_interlaced,
        pix_fmt,
        color_space,
        color_primaries,
        color_transfer,
        format_name,
        standard,
    })
}

/// Executes FFprobe silently on the target media file and parses its JSON stream report.
pub fn probe_media_file(file_path: &str, ffprobe_binary: &str) -> Result<MediaProbeResult, String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("Media file not found: '{file_path}'"));
    }

    let args = build_ffprobe_args(file_path);
    let mut cmd = create_silent_command(Path::new(ffprobe_binary));
    cmd.args(&args);

    let output = cmd.output().map_err(|e| format!("Failed to spawn ffprobe '{ffprobe_binary}': {e}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFprobe failed with status {}: {err}", output.status));
    }

    let json_text = String::from_utf8(output.stdout)
        .map_err(|e| format!("FFprobe output is not valid UTF-8: {e}"))?;

    parse_ffprobe_json(&json_text, file_path)
}

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

    let mut cmd = create_silent_command(Path::new(ffmpeg_binary));
    let (fps_filter, sample_interval_sec) = if probe.duration > 30.0 {
        let interval = (probe.duration / 10.0).max(1.0);
        (format!("fps=1/{interval:.4}"), interval)
    } else {
        ("fps=1".to_string(), 1.0)
    };

    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        file_path,
        "-vf",
        &fps_filter,
        "-vframes",
        "10",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "yuv420p",
        "pipe:1",
    ]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to spawn FFmpeg QC sampler: {e}"))?;
    let stdout = output.stdout;

    let w = probe.width as usize;
    let h = probe.height as usize;
    let y_size = w * h;
    let u_size = (w / 2) * (h / 2);
    let v_size = u_size;
    let frame_size = y_size + u_size + v_size;

    let mut reports = Vec::new();
    let mut black_leader_count = 0;
    let mut past_leader = false;

    if frame_size > 0 && stdout.len() >= frame_size {
        for chunk in stdout.chunks_exact(frame_size) {
            let y_plane = &chunk[..y_size];
            let u_plane = &chunk[y_size..y_size + u_size];
            let v_plane = &chunk[y_size + u_size..];

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

/// Samples 3 seconds of audio to automatically detect channel layout and recommend channel policy.
pub fn detect_audio_policy(
    input_path: &str,
    start_sec: f64,
    ffmpeg_binary: &str,
) -> crate::domain::pipeline::AudioChannelPolicy {
    let mut cmd = create_silent_command(Path::new(ffmpeg_binary));
    let ss_str = format!("{start_sec:.3}");
    cmd.args([
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        &ss_str,
        "-t",
        "3",
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

    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return crate::domain::pipeline::AudioChannelPolicy::Stereo,
    };

    let bytes = output.stdout;
    if bytes.len() < 8 {
        return crate::domain::pipeline::AudioChannelPolicy::Stereo;
    }

    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let report = crate::domain::audio::analyze_interleaved_stereo(&samples);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_frame_rate_rational() {
        let (fps, rat) = parse_frame_rate_rational("30000/1001");
        assert!((fps - 29.97003).abs() < 0.001);
        assert_eq!(rat, "30000/1001");

        let (fps_pal, rat_pal) = parse_frame_rate_rational("25/1");
        assert_eq!(fps_pal, 25.0);
        assert_eq!(rat_pal, "25/1");

        let (fps_empty, _) = parse_frame_rate_rational("");
        assert!((fps_empty - 29.97).abs() < 0.01);
    }

    #[test]
    fn test_classify_broadcast_standard() {
        assert_eq!(classify_broadcast_standard(720, 480, 29.97), "NTSC");
        assert_eq!(classify_broadcast_standard(720, 576, 25.0), "PAL");
        assert_eq!(classify_broadcast_standard(1920, 1080, 29.97), "HD");
        assert_eq!(classify_broadcast_standard(800, 600, 60.0), "CUSTOM");
    }

    #[test]
    fn test_is_interlaced_field_order() {
        assert!(is_interlaced_field_order("tt"));
        assert!(is_interlaced_field_order("bb"));
        assert!(is_interlaced_field_order("Top First"));
        assert!(!is_interlaced_field_order("progressive"));
        assert!(!is_interlaced_field_order("unknown"));
    }

    #[test]
    fn test_calculate_expected_frames() {
        assert_eq!(calculate_expected_frames(10.0, 29.97002997), 300);
        assert_eq!(calculate_expected_frames(0.0, 29.97), 0);
    }

    #[test]
    fn test_parse_ffprobe_json_success() {
        let sample = r#"{
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "ffv1",
                    "width": 720,
                    "height": 480,
                    "r_frame_rate": "30000/1001",
                    "duration": "60.0",
                    "field_order": "tt",
                    "pix_fmt": "yuv422p"
                },
                {
                    "codec_type": "audio",
                    "codec_name": "pcm_s16le",
                    "channels": 2,
                    "sample_rate": "48000"
                }
            ],
            "format": {
                "format_name": "matroska,webm",
                "duration": "60.0"
            }
        }"#;

        let res = parse_ffprobe_json(sample, "C:/tapes/tape01.mkv").expect("Probe should succeed");
        assert_eq!(res.width, 720);
        assert_eq!(res.height, 480);
        assert_eq!(res.video_codec, "ffv1");
        assert_eq!(res.audio_codec, "pcm_s16le");
        assert_eq!(res.audio_channels, 2);
        assert_eq!(res.audio_sample_rate, 48000);
        assert!(res.is_interlaced);
        assert_eq!(res.standard, "NTSC");
        assert_eq!(res.total_frames, 1798);
    }

    #[test]
    fn test_probe_media_file_missing_file_fails() {
        let res = probe_media_file("nonexistent_tape_file_9876.avi", "ffprobe");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Media file not found"));
    }
}
