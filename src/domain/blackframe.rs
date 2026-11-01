//! Pure Functional Blackframe Detection, Interval Merging, Leader/Trailer A/V Trim,
//! and Mid-Tape TBC Frame-Hold Engine (`domain::blackframe`).
//!
//! Replaces legacy `00_trim_black_sync.py` and `00_black_hold.py` with zero-regex,
//! deterministic Rust slice/string algorithms that preserve 100% A/V lip-sync.

use serde::{Deserialize, Serialize};

use crate::models::constants::{
    BLACK_DETECT_MIN_DURATION_SEC, BLACK_DETECT_PIC_TH, BLACK_DETECT_PIX_TH,
    BLACK_LEADER_MAX_START_SEC, BLACK_MERGE_MAX_GAP_SEC, BLACK_TRAILER_EPSILON_SEC,
};

/// Single black video interval detected by FFmpeg `blackdetect`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BlackInterval {
    pub start_sec: f64,
    pub end_sec: f64,
    pub duration_sec: f64,
}

impl BlackInterval {
    #[must_use]
    pub fn new(start_sec: f64, end_sec: f64) -> Self {
        let clean_start = start_sec.max(0.0);
        let clean_end = end_sec.max(clean_start);
        Self {
            start_sec: clean_start,
            end_sec: clean_end,
            duration_sec: (clean_end - clean_start).max(0.0),
        }
    }
}

/// Strategy for handling black regions in analog captures and restored masters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlackframeCleanMode {
    /// Trim synchronous A/V leader & trailer AND freeze mid-tape dropouts (TBC Frame-Hold).
    Auto,
    /// Only trim synchronous A/V leader and trailer; leave mid-tape untouched.
    LeaderTrailerOnly,
    /// Only freeze mid-tape dropouts using TBC Frame-Hold; keep leader and trailer boundaries.
    FreezeMidgaps,
}

impl BlackframeCleanMode {
    #[must_use]
    pub fn from_str_lossy(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "leader_trailer_only" | "trim_only" | "leader_trailer" => Self::LeaderTrailerOnly,
            "freeze_midgaps" | "freeze" | "tbc_hold" => Self::FreezeMidgaps,
            _ => Self::Auto,
        }
    }
}

/// Classified black regions across the timeline of a media file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BlackRegionClassification {
    pub total_duration_sec: f64,
    pub leader: Option<BlackInterval>,
    pub trailer: Option<BlackInterval>,
    pub mid_gaps: Vec<BlackInterval>,
    pub effective_start_sec: f64,
    pub effective_end_sec: f64,
    pub is_fully_black: bool,
}

/// Builds the FFmpeg CLI arguments for a fast null-mux `blackdetect` analysis pass.
#[must_use]
pub fn build_blackdetect_cli_args(input_path: &str) -> Vec<String> {
    let filter = format!(
        "blackdetect=d={:.3}:pix_th={:.2}:pic_th={:.2}",
        BLACK_DETECT_MIN_DURATION_SEC, BLACK_DETECT_PIX_TH, BLACK_DETECT_PIC_TH
    );
    vec![
        "-hide_banner".to_string(),
        "-nostats".to_string(),
        "-i".to_string(),
        input_path.to_string(),
        "-vf".to_string(),
        filter,
        "-an".to_string(),
        "-f".to_string(),
        "null".to_string(),
        "-".to_string(),
    ]
}

/// Extracts a floating-point token immediately following `prefix` (e.g. `black_start:`).
fn extract_metric_after(line: &str, prefix: &str) -> Option<f64> {
    let idx = line.find(prefix)?;
    let rest = &line[idx + prefix.len()..];
    let token: String = rest
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();
    token.parse::<f64>().ok()
}

/// Pure zero-regex parser for FFmpeg `blackdetect` stderr output lines.
///
/// Example line:
/// `[blackdetect @ 0x...] black_start:0 black_end:1.84 black_duration:1.84`
#[must_use]
pub fn parse_blackdetect_stderr(stderr_output: &str) -> Vec<BlackInterval> {
    stderr_output
        .lines()
        .filter(|line| line.contains("black_start:") && line.contains("black_end:"))
        .filter_map(|line| {
            let start = extract_metric_after(line, "black_start:")?;
            let end = extract_metric_after(line, "black_end:")?;
            if end > start {
                Some(BlackInterval::new(start, end))
            } else {
                None
            }
        })
        .collect()
}

/// Pure interval merger that fuses contiguous or micro-gapped black intervals
/// separated by brief analog tracking static (`gap <= max_gap_sec`).
#[must_use]
pub fn merge_black_intervals(intervals: &[BlackInterval], max_gap_sec: f64) -> Vec<BlackInterval> {
    if intervals.is_empty() {
        return Vec::new();
    }

    let gap_tolerance = max_gap_sec.max(0.0);
    let mut sorted = intervals.to_vec();
    sorted.sort_by(|a, b| {
        a.start_sec
            .partial_cmp(&b.start_sec)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut merged: Vec<BlackInterval> = Vec::with_capacity(sorted.len());
    for current in sorted {
        if let Some(last) = merged.last_mut() {
            if current.start_sec <= last.end_sec + gap_tolerance {
                let new_end = last.end_sec.max(current.end_sec);
                *last = BlackInterval::new(last.start_sec, new_end);
                continue;
            }
        }
        merged.push(current);
    }

    merged
}

/// Pure classifier partitioning merged black intervals into `Leader`, `Trailer`, and `MidGaps`.
#[must_use]
pub fn classify_black_regions(
    raw_intervals: &[BlackInterval],
    total_duration_sec: f64,
) -> BlackRegionClassification {
    let clean_duration = total_duration_sec.max(0.0);
    let merged = merge_black_intervals(raw_intervals, BLACK_MERGE_MAX_GAP_SEC);

    if merged.is_empty() || clean_duration <= 0.0 {
        return BlackRegionClassification {
            total_duration_sec: clean_duration,
            leader: None,
            trailer: None,
            mid_gaps: Vec::new(),
            effective_start_sec: 0.0,
            effective_end_sec: clean_duration,
            is_fully_black: false,
        };
    }

    // Edge case: entire file is black
    if merged.len() == 1
        && merged[0].start_sec <= BLACK_LEADER_MAX_START_SEC
        && merged[0].end_sec >= (clean_duration - BLACK_TRAILER_EPSILON_SEC).max(0.0)
    {
        return BlackRegionClassification {
            total_duration_sec: clean_duration,
            leader: Some(merged[0]),
            trailer: None,
            mid_gaps: Vec::new(),
            effective_start_sec: 0.0,
            effective_end_sec: clean_duration,
            is_fully_black: true,
        };
    }

    let mut leader: Option<BlackInterval> = None;
    let mut trailer: Option<BlackInterval> = None;
    let mut mid_gaps: Vec<BlackInterval> = Vec::new();

    let count = merged.len();
    for (idx, interval) in merged.into_iter().enumerate() {
        let is_at_start = idx == 0 && interval.start_sec <= BLACK_LEADER_MAX_START_SEC;
        let is_at_end = idx + 1 == count
            && clean_duration > BLACK_TRAILER_EPSILON_SEC
            && interval.end_sec >= clean_duration - BLACK_TRAILER_EPSILON_SEC;

        if is_at_start {
            leader = Some(interval);
        } else if is_at_end {
            trailer = Some(interval);
        } else {
            mid_gaps.push(interval);
        }
    }

    let effective_start_sec = leader.map_or(0.0, |l| l.end_sec.min(clean_duration));
    let effective_end_sec = trailer
        .map_or(clean_duration, |t| t.start_sec.max(effective_start_sec));

    BlackRegionClassification {
        total_duration_sec: clean_duration,
        leader,
        trailer,
        mid_gaps,
        effective_start_sec,
        effective_end_sec,
        is_fully_black: false,
    }
}

/// Builds an FFmpeg video filter expression that freezes the last valid frame across
/// mid-tape dropout intervals (`lagfun`).
#[must_use]
pub fn build_tbc_freeze_video_filter(mid_gaps: &[BlackInterval], offset_sec: f64) -> Option<String> {
    if mid_gaps.is_empty() {
        return None;
    }

    // Adjust mid-gap timestamps relative to the trimmed start (`offset_sec`)
    let active_windows: Vec<String> = mid_gaps
        .iter()
        .filter_map(|gap| {
            let rel_start = (gap.start_sec - offset_sec).max(0.0);
            let rel_end = (gap.end_sec - offset_sec).max(0.0);
            if rel_end > rel_start + 0.010 {
                Some(format!("between(t,{rel_start:.3},{rel_end:.3})"))
            } else {
                None
            }
        })
        .collect();

    if active_windows.is_empty() {
        return None;
    }

    let enable_expr = active_windows.join("+");
    Some(format!("lagfun=decay=0.999:planes=15:enable='{enable_expr}'"))
}

/// Builds the complete FFmpeg CLI argument vector to execute a fast blackframe clean pass.
#[must_use]
pub fn build_blackframe_clean_ffmpeg_args(
    input_path: &str,
    output_path: &str,
    classification: &BlackRegionClassification,
    mode: BlackframeCleanMode,
) -> Option<Vec<String>> {
    if classification.is_fully_black {
        return None;
    }

    let apply_trim = matches!(
        mode,
        BlackframeCleanMode::Auto | BlackframeCleanMode::LeaderTrailerOnly
    );
    let apply_freeze = matches!(
        mode,
        BlackframeCleanMode::Auto | BlackframeCleanMode::FreezeMidgaps
    );

    let has_trim = apply_trim
        && (classification.leader.is_some() || classification.trailer.is_some())
        && classification.effective_end_sec > classification.effective_start_sec;

    let offset_sec = if has_trim {
        classification.effective_start_sec
    } else {
        0.0
    };

    let freeze_filter = if apply_freeze {
        build_tbc_freeze_video_filter(&classification.mid_gaps, offset_sec)
    } else {
        None
    };

    if !has_trim && freeze_filter.is_none() {
        return None;
    }

    let mut args = vec![
        "-hide_banner".to_string(),
        "-nostats".to_string(),
        "-y".to_string(),
    ];

    if has_trim && classification.effective_start_sec > 0.0 {
        args.push("-ss".to_string());
        args.push(format!("{:.3}", classification.effective_start_sec));
    }

    if has_trim && classification.effective_end_sec < classification.total_duration_sec {
        args.push("-to".to_string());
        args.push(format!("{:.3}", classification.effective_end_sec));
    }

    args.push("-i".to_string());
    args.push(input_path.to_string());

    if let Some(vf) = freeze_filter {
        args.extend([
            "-vf".to_string(),
            vf,
            "-c:v".to_string(),
            "libx264".to_string(),
            "-crf".to_string(),
            "16".to_string(),
            "-preset".to_string(),
            "fast".to_string(),
            "-c:a".to_string(),
            "copy".to_string(),
        ]);
    } else {
        args.extend(["-c".to_string(), "copy".to_string()]);
    }

    if output_path.to_ascii_lowercase().ends_with(".mp4")
        || output_path.to_ascii_lowercase().ends_with(".mov")
    {
        args.extend(["-movflags".to_string(), "+faststart".to_string()]);
    }

    args.push(output_path.to_string());
    Some(args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_blackdetect_stderr_extracts_intervals() {
        let stderr = "\
[Parsed_blackdetect_0 @ 000001] black_start:0.000 black_end:2.450 black_duration:2.450
frame= 1200 fps=400 q=-0.0 size=N/A time=00:00:20.00 bitrate=N/A
[Parsed_blackdetect_0 @ 000001] black_start:45.100 black_end:45.300 black_duration:0.200
[Parsed_blackdetect_0 @ 000001] black_start:45.400 black_end:45.800 black_duration:0.400
[Parsed_blackdetect_0 @ 000001] black_start:118.000 black_end:120.000 black_duration:2.000
";
        let intervals = parse_blackdetect_stderr(stderr);
        assert_eq!(intervals.len(), 4);
        assert!((intervals[0].start_sec - 0.0).abs() < 1e-6);
        assert!((intervals[0].end_sec - 2.45).abs() < 1e-6);
        assert!((intervals[1].start_sec - 45.1).abs() < 1e-6);
        assert!((intervals[2].end_sec - 45.8).abs() < 1e-6);
    }

    #[test]
    fn test_video_without_blackframes() {
        let classification = classify_black_regions(&[], 120.0);
        assert!(classification.leader.is_none());
        assert!(classification.trailer.is_none());
        assert!(classification.mid_gaps.is_empty());
        assert!(!classification.is_fully_black);
        assert!((classification.effective_start_sec - 0.0).abs() < 1e-6);
        assert!((classification.effective_end_sec - 120.0).abs() < 1e-6);
        assert!(build_blackframe_clean_ffmpeg_args(
            "in.mp4",
            "out.mp4",
            &classification,
            BlackframeCleanMode::Auto
        )
        .is_none());
    }

    #[test]
    fn test_completely_black_video_is_guarded() {
        let raw = vec![BlackInterval::new(0.0, 60.0)];
        let classification = classify_black_regions(&raw, 60.0);
        assert!(classification.is_fully_black);
        assert!(build_blackframe_clean_ffmpeg_args(
            "in.mp4",
            "out.mp4",
            &classification,
            BlackframeCleanMode::Auto
        )
        .is_none());
    }

    #[test]
    fn test_tape_with_initial_leader_only_uses_stream_copy() {
        let raw = vec![BlackInterval::new(0.0, 3.2)];
        let classification = classify_black_regions(&raw, 180.0);
        assert!(classification.leader.is_some());
        assert!(classification.trailer.is_none());
        assert!(classification.mid_gaps.is_empty());
        assert!((classification.effective_start_sec - 3.2).abs() < 1e-6);
        assert!((classification.effective_end_sec - 180.0).abs() < 1e-6);

        let args = build_blackframe_clean_ffmpeg_args(
            "master.mp4",
            "master_clean.mp4",
            &classification,
            BlackframeCleanMode::Auto,
        )
        .expect("should produce trim args");
        assert!(args.contains(&"-ss".to_string()));
        assert!(args.contains(&"3.200".to_string()));
        assert!(args.contains(&"copy".to_string()));
    }

    #[test]
    fn test_tape_with_leader_trailer_and_intermittent_dropouts_merges_and_freezes() {
        let raw = vec![
            BlackInterval::new(0.0, 2.0),
            BlackInterval::new(45.10, 45.30),
            BlackInterval::new(45.40, 45.80),
            BlackInterval::new(118.0, 120.0),
        ];
        let classification = classify_black_regions(&raw, 120.0);
        assert!(classification.leader.is_some());
        assert!(classification.trailer.is_some());
        assert_eq!(classification.mid_gaps.len(), 1);
        assert!((classification.mid_gaps[0].start_sec - 45.10).abs() < 1e-6);
        assert!((classification.mid_gaps[0].end_sec - 45.80).abs() < 1e-6);

        let args = build_blackframe_clean_ffmpeg_args(
            "master.mp4",
            "master_clean.mp4",
            &classification,
            BlackframeCleanMode::Auto,
        )
        .expect("should produce trim + freeze args");
        assert!(args.contains(&"-ss".to_string()));
        assert!(args.contains(&"2.000".to_string()));
        assert!(args.contains(&"-to".to_string()));
        assert!(args.contains(&"118.000".to_string()));
        assert!(args.iter().any(|a| a.contains("between(t,43.100,43.800)")));
    }
}
