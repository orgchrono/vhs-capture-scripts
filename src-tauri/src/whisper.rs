//! Whisper AI Transcription & Subtitle Formatter Engine.
//!
//! Pure functional WebVTT and SubRip (.srt) generator, 16kHz audio extraction
//! argument builder, broadcast timecode conversions, and speech language disambiguation.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubtitleSegment {
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LanguageCandidate {
    pub language: String,
    pub probability: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpeechProbeResult {
    pub has_speech: bool,
    pub first_speech_time: f64,
    pub detected_language: String,
    pub probability: f32,
    pub is_ambiguous: bool,
    pub candidates: Vec<LanguageCandidate>,
}

/// Format seconds to WebVTT timestamp: `HH:MM:SS.mmm`.
#[must_use]
pub fn format_vtt_timestamp(seconds: f64) -> String {
    let s = seconds.max(0.0);
    let hrs = (s / 3600.0).floor() as u64;
    let rem = s % 3600.0;
    let mins = (rem / 60.0).floor() as u64;
    let secs = rem % 60.0;
    format!("{:02}:{:02}:{:06.3}", hrs, mins, secs)
}

/// Format seconds to SubRip (.srt) timestamp: `HH:MM:SS,mmm`.
#[must_use]
pub fn format_srt_timestamp(seconds: f64) -> String {
    let s = seconds.max(0.0);
    let hrs = (s / 3600.0).floor() as u64;
    let rem = s % 3600.0;
    let mins = (rem / 60.0).floor() as u64;
    let secs = (rem % 60.0).floor() as u64;
    let ms = ((rem % 1.0) * 1000.0).round() as u64;
    format!("{:02}:{:02}:{:02},{:03}", hrs, mins, secs, ms)
}

/// Pure generator producing standard WebVTT subtitle document from segments.
#[must_use]
pub fn generate_vtt_content(segments: &[SubtitleSegment]) -> String {
    let mut out = String::from("WEBVTT\n\n");
    for seg in segments {
        let start = format_vtt_timestamp(seg.start_seconds);
        let end = format_vtt_timestamp(seg.end_seconds);
        out.push_str(&format!("{} --> {}\n{}\n\n", start, end, seg.text.trim()));
    }
    out
}

/// Pure generator producing standard SubRip (.srt) subtitle document from segments.
#[must_use]
pub fn generate_srt_content(segments: &[SubtitleSegment]) -> String {
    let mut out = String::new();
    for (idx, seg) in segments.iter().enumerate() {
        let index = idx + 1;
        let start = format_srt_timestamp(seg.start_seconds);
        let end = format_srt_timestamp(seg.end_seconds);
        out.push_str(&format!("{}\n{} --> {}\n{}\n\n", index, start, end, seg.text.trim()));
    }
    out
}

/// Pure builder generating FFmpeg arguments for extracting 16kHz mono audio for Whisper.
#[must_use]
pub fn build_audio_extract_args(
    video_path: &str,
    output_wav_path: &str,
    ffmpeg_binary: &str,
) -> Vec<String> {
    vec![
        ffmpeg_binary.to_string(),
        "-hide_banner".to_string(),
        "-threads".to_string(),
        "0".to_string(),
        "-y".to_string(),
        "-i".to_string(),
        video_path.to_string(),
        "-vn".to_string(),
        "-acodec".to_string(),
        "pcm_s16le".to_string(),
        "-ar".to_string(),
        "16000".to_string(),
        "-ac".to_string(),
        "1".to_string(),
        output_wav_path.to_string(),
    ]
}

/// Pure resolver disambiguating detected speech language to prevent tape noise hallucinations.
#[must_use]
pub fn disambiguate_speech_language(
    detected_lang: &str,
    prob: f32,
    has_speech: bool,
) -> (String, bool) {
    if !has_speech || prob < 0.70 {
        ("pt".to_string(), true)
    } else {
        (detected_lang.trim().to_ascii_lowercase(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_vtt_timestamp() {
        assert_eq!(format_vtt_timestamp(0.0), "00:00:00.000");
        assert_eq!(format_vtt_timestamp(90.5), "00:01:30.500");
        assert_eq!(format_vtt_timestamp(3661.125), "01:01:01.125");
    }

    #[test]
    fn test_format_srt_timestamp() {
        assert_eq!(format_srt_timestamp(0.0), "00:00:00,000");
        assert_eq!(format_srt_timestamp(90.5), "00:01:30,500");
        assert_eq!(format_srt_timestamp(3661.125), "01:01:01,125");
    }

    #[test]
    fn test_generate_vtt_content() {
        let segments = vec![
            SubtitleSegment {
                start_seconds: 1.0,
                end_seconds: 4.5,
                text: "Hello world".to_string(),
            },
            SubtitleSegment {
                start_seconds: 5.0,
                end_seconds: 8.0,
                text: "Second line".to_string(),
            },
        ];

        let vtt = generate_vtt_content(&segments);
        assert!(vtt.starts_with("WEBVTT\n\n"));
        assert!(vtt.contains("00:00:01.000 --> 00:00:04.500\nHello world\n\n"));
        assert!(vtt.contains("00:00:05.000 --> 00:00:08.000\nSecond line\n\n"));
    }

    #[test]
    fn test_generate_srt_content() {
        let segments = vec![
            SubtitleSegment {
                start_seconds: 1.0,
                end_seconds: 4.5,
                text: "Hello world".to_string(),
            },
        ];

        let srt = generate_srt_content(&segments);
        assert!(srt.starts_with("1\n00:00:01,000 --> 00:00:04,500\nHello world\n\n"));
    }

    #[test]
    fn test_build_audio_extract_args() {
        let args = build_audio_extract_args("in.mkv", "out.wav", "ffmpeg");
        assert_eq!(args[0], "ffmpeg");
        assert!(args.contains(&"16000".to_string()));
        assert!(args.contains(&"pcm_s16le".to_string()));
    }

    #[test]
    fn test_disambiguate_speech_language() {
        // High confidence speech
        let (lang, ambiguous) = disambiguate_speech_language("en", 0.95, true);
        assert_eq!(lang, "en");
        assert!(!ambiguous);

        // Low confidence tape noise -> fallback to Portuguese to eliminate hallucination
        let (lang_low, ambig_low) = disambiguate_speech_language("ru", 0.45, true);
        assert_eq!(lang_low, "pt");
        assert!(ambig_low);

        // No speech -> fallback to Portuguese
        let (lang_no, ambig_no) = disambiguate_speech_language("en", 0.90, false);
        assert_eq!(lang_no, "pt");
        assert!(ambig_no);
    }
}
