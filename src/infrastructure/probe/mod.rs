//! Fast Media Probe & FFprobe Parser (`infrastructure::probe`).
//!
//! Pure functional extraction and classification of video and audio streams,
//! broadcast standards (NTSC vs PAL), interlacing field order, frame rate rationales,
//! and duration metrics from `ffprobe` JSON output.

pub mod audio_policy;
pub mod classifier;
pub mod models;
pub mod qc_sampler;
pub mod runner;

pub use audio_policy::detect_audio_policy;
pub use classifier::{
    calculate_expected_frames, classify_broadcast_standard, is_interlaced_field_order,
    parse_frame_rate_rational, DEFAULT_NTSC_FPS, DEFAULT_PAL_FPS,
};
pub use models::{MediaProbeResult, RawFFprobeOutput, RawFormat, RawStream};
pub use qc_sampler::assess_media_file_qc;
pub use runner::{build_ffprobe_args, parse_ffprobe_json, probe_media_file};

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
