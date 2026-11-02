//! FFprobe Invocation & JSON Stream Deserializer (`probe/runner.rs`).

use std::path::Path;
use crate::toolchain::create_silent_command;
use super::classifier::{calculate_expected_frames, classify_broadcast_standard, is_interlaced_field_order, parse_frame_rate_rational};
use super::models::{MediaProbeResult, RawFFprobeOutput};

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
        .map_err(|e| format!("Invalid ffprobe JSON: {e}"))?;

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

    let parsed_nb_frames = v_stream
        .and_then(|s| s.nb_frames.as_deref())
        .and_then(|nf| nf.parse::<u64>().ok())
        .unwrap_or(0);

    if duration <= 0.0 && parsed_nb_frames > 0 && fps > 0.0 {
        duration = parsed_nb_frames as f64 / fps;
    }

    if duration <= 0.0 {
        if let (Some(size_str), Some(br_str)) = (
            raw.format.as_ref().and_then(|f| f.size.as_deref()),
            raw.format.as_ref().and_then(|f| f.bit_rate.as_deref()),
        ) {
            if let (Ok(size), Ok(br)) = (size_str.parse::<f64>(), br_str.parse::<f64>()) {
                if br > 0.0 {
                    duration = (size * 8.0) / br;
                }
            }
        }
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
    let total_frames = if parsed_nb_frames > 0 {
        parsed_nb_frames
    } else {
        calculate_expected_frames(duration, fps)
    };

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
