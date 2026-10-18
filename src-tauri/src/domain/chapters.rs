//! VHS Studio Pro - Pure Functional Scene & Chapter Metadata Module (`chapters.rs`).
//!
//! Provides deterministic parsing of camera transition timestamps and generation
//! of FFmetadata1 and WebVTT chapter streams.

use serde::{Deserialize, Serialize};

/// Discrete chapter interval in milliseconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChapterInterval {
    pub start_ms: u64,
    pub end_ms: u64,
    pub scene_index: usize,
}

/// Parses PySceneDetect CSV export text into a structured list of ChapterIntervals.
#[must_use]
pub fn parse_scenedetect_csv(csv_content: &str) -> Vec<ChapterInterval> {
    let mut scenes = Vec::new();
    let mut is_header_passed = false;
    let mut scene_idx = 1;

    for line in csv_content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Scene Number") {
            is_header_passed = true;
            continue;
        }
        if !is_header_passed || trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split(',').map(|s| s.trim()).collect();
        // Format: Scene Number, Frame Start, TC Start, Sec Start, Frame End, TC End, Sec End
        if parts.len() >= 7 {
            if let (Ok(start_sec), Ok(end_sec)) = (parts[3].parse::<f64>(), parts[6].parse::<f64>()) {
                let start_ms = (start_sec * 1000.0).round().max(0.0) as u64;
                let end_ms = (end_sec * 1000.0).round().max(0.0) as u64;
                scenes.push(ChapterInterval {
                    start_ms,
                    end_ms,
                    scene_index: scene_idx,
                });
                scene_idx += 1;
            }
        }
    }
    scenes
}

/// Generates FFmetadata1 chapter text representation.
#[must_use]
pub fn generate_ffmetadata_text(
    title: &str,
    scenes: &[ChapterInterval],
    chapter_prefix: Option<&str>,
) -> String {
    let prefix = chapter_prefix.unwrap_or("Scene");
    let mut out = format!(";FFMETADATA1\ntitle={title}\n\n");
    for s in scenes {
        out.push_str("[CHAPTER]\n");
        out.push_str("TIMEBASE=1/1000\n");
        out.push_str(&format!("START={}\n", s.start_ms));
        out.push_str(&format!("END={}\n", s.end_ms));
        out.push_str(&format!("title={} {}\n\n", prefix, s.scene_index));
    }
    out
}

/// Generates WebVTT chapter track text representation.
#[must_use]
pub fn generate_webvtt_text(scenes: &[ChapterInterval], chapter_prefix: Option<&str>) -> String {
    let prefix = chapter_prefix.unwrap_or("Scene");
    let mut out = String::from("WEBVTT\n\n");
    for s in scenes {
        let start_tc = format_ms_to_webvtt(s.start_ms);
        let end_tc = format_ms_to_webvtt(s.end_ms);
        out.push_str(&format!("{start_tc} --> {end_tc}\n"));
        out.push_str(&format!("{} {}\n\n", prefix, s.scene_index));
    }
    out
}

fn format_ms_to_webvtt(ms: u64) -> String {
    let total_secs = ms / 1000;
    let millis = ms % 1000;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let secs = total_secs % 60;
    format!("{hours:02}:{mins:02}:{secs:02}.{millis:03}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_CSV: &str = "\
Timecode List:
Scene Number,Frame Number (Start),Timecode (Start),Seconds (Start),Frame Number (End),Timecode (End),Seconds (End)
1,0,00:00:00.000,0.000,30,00:00:01.000,1.000
2,31,00:00:01.033,1.033,60,00:00:02.000,2.000
";

    #[test]
    fn test_parse_scenedetect_csv_parses_intervals() {
        let scenes = parse_scenedetect_csv(SAMPLE_CSV);
        assert_eq!(scenes.len(), 2);
        assert_eq!(scenes[0].start_ms, 0);
        assert_eq!(scenes[0].end_ms, 1000);
        assert_eq!(scenes[0].scene_index, 1);
        assert_eq!(scenes[1].start_ms, 1033);
        assert_eq!(scenes[1].end_ms, 2000);
        assert_eq!(scenes[1].scene_index, 2);
    }

    #[test]
    fn test_generate_ffmetadata_output() {
        let scenes = parse_scenedetect_csv(SAMPLE_CSV);
        let meta = generate_ffmetadata_text("Tape 1994", &scenes, Some("Scene"));
        assert!(meta.contains(";FFMETADATA1"));
        assert!(meta.contains("title=Tape 1994"));
        assert!(meta.contains("START=0"));
        assert!(meta.contains("END=1000"));
        assert!(meta.contains("title=Scene 1"));
        assert!(meta.contains("START=1033"));
        assert!(meta.contains("title=Scene 2"));
    }

    #[test]
    fn test_generate_webvtt_output() {
        let scenes = parse_scenedetect_csv(SAMPLE_CSV);
        let vtt = generate_webvtt_text(&scenes, Some("Scene"));
        assert!(vtt.starts_with("WEBVTT\n\n"));
        assert!(vtt.contains("00:00:00.000 --> 00:00:01.000\nScene 1"));
        assert!(vtt.contains("00:00:01.033 --> 00:00:02.000\nScene 2"));
    }
}
