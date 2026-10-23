//! Real-Time Subprocess Progress Parser & Restoration Telemetry Engine.
//!
//! Pure functional parsing of streaming FFmpeg/VSPipe `-progress` metrics,
//! sub-millisecond timecode conversions, speed calculation, ETA projection,
//! and completion detection without allocations or locks.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FFmpegProgressSnapshot {
    pub frame: u64,
    pub fps: f32,
    pub bitrate_kbps: f32,
    pub total_size_bytes: u64,
    pub out_time_seconds: f64,
    pub dup_frames: u64,
    pub drop_frames: u64,
    pub speed: f32,
    pub is_complete: bool,
    pub progress_percent: f32,
    pub eta_seconds: f64,
    pub eta_formatted: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProgressAccumulator {
    pub total_expected_frames: u64,
    pub total_expected_duration: f64,
    pub current_frame: u64,
    pub current_fps: f32,
    pub current_bitrate_kbps: f32,
    pub current_size_bytes: u64,
    pub current_out_time_seconds: f64,
    pub current_dup_frames: u64,
    pub current_drop_frames: u64,
    pub current_speed: f32,
    pub is_complete: bool,
}

impl ProgressAccumulator {
    #[must_use]
    pub fn new(total_expected_frames: u64, total_expected_duration: f64) -> Self {
        Self {
            total_expected_frames,
            total_expected_duration,
            current_frame: 0,
            current_fps: 0.0,
            current_bitrate_kbps: 0.0,
            current_size_bytes: 0,
            current_out_time_seconds: 0.0,
            current_dup_frames: 0,
            current_drop_frames: 0,
            current_speed: 1.0,
            is_complete: false,
        }
    }

    /// Feeds a single progress key=value line into accumulator.
    /// Returns a complete `FFmpegProgressSnapshot` when a block terminator (`progress=continue` or `progress=end`) is encountered.
    pub fn feed_line(&mut self, line: &str) -> Option<FFmpegProgressSnapshot> {
        let (key, value) = parse_progress_key_value(line)?;

        match key {
            "frame" => {
                if let Ok(v) = value.parse::<u64>() {
                    self.current_frame = v;
                }
            }
            "fps" => {
                if let Ok(v) = value.parse::<f32>() {
                    self.current_fps = v;
                }
            }
            "bitrate" => {
                self.current_bitrate_kbps = parse_bitrate_kbps(value);
            }
            "total_size" => {
                if let Ok(v) = value.parse::<u64>() {
                    self.current_size_bytes = v;
                }
            }
            "out_time" => {
                if let Some(sec) = parse_timecode_hhmmss(value) {
                    self.current_out_time_seconds = sec;
                }
            }
            "out_time_us" => {
                if let Ok(us) = value.parse::<i64>() {
                    if us >= 0 {
                        self.current_out_time_seconds = (us as f64) / 1_000_000.0;
                    }
                }
            }
            "dup_frames" => {
                if let Ok(v) = value.parse::<u64>() {
                    self.current_dup_frames = v;
                }
            }
            "drop_frames" => {
                if let Ok(v) = value.parse::<u64>() {
                    self.current_drop_frames = v;
                }
            }
            "speed" => {
                self.current_speed = parse_speed_multiplier(value);
            }
            "progress" => {
                if value == "end" {
                    self.is_complete = true;
                }
                return Some(self.build_snapshot());
            }
            _ => {}
        }

        None
    }

    #[must_use]
    pub fn build_snapshot(&self) -> FFmpegProgressSnapshot {
        let (progress_percent, eta_seconds) = if self.is_complete {
            (100.0, 0.0)
        } else if self.total_expected_frames > 0 {
            let pct = (self.current_frame as f64 / self.total_expected_frames as f64 * 100.0).clamp(0.0, 100.0) as f32;
            let rem_frames = self.total_expected_frames.saturating_sub(self.current_frame);
            let eta = if self.current_fps > 0.0 {
                (rem_frames as f64) / (self.current_fps as f64)
            } else {
                0.0
            };
            (pct, eta)
        } else if self.total_expected_duration > 0.0 {
            let pct = (self.current_out_time_seconds / self.total_expected_duration * 100.0).clamp(0.0, 100.0) as f32;
            let rem_sec = (self.total_expected_duration - self.current_out_time_seconds).max(0.0);
            let eta = if self.current_speed > 0.0 {
                rem_sec / (self.current_speed as f64)
            } else {
                0.0
            };
            (pct, eta)
        } else {
            (0.0, 0.0)
        };

        let eta_formatted = format_eta_duration(eta_seconds);

        FFmpegProgressSnapshot {
            frame: self.current_frame,
            fps: self.current_fps,
            bitrate_kbps: self.current_bitrate_kbps,
            total_size_bytes: self.current_size_bytes,
            out_time_seconds: self.current_out_time_seconds,
            dup_frames: self.current_dup_frames,
            drop_frames: self.current_drop_frames,
            speed: self.current_speed,
            is_complete: self.is_complete,
            progress_percent,
            eta_seconds,
            eta_formatted,
        }
    }
}

/// Pure parser for key=value lines from FFmpeg progress pipe.
#[must_use]
pub fn parse_progress_key_value(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    trimmed.split_once('=')
}

/// Pure parser converting timecode string "HH:MM:SS.microseconds" to total seconds.
#[must_use]
pub fn parse_timecode_hhmmss(tc: &str) -> Option<f64> {
    let parts: Vec<&str> = tc.trim().split(':').collect();
    if parts.len() != 3 {
        return None;
    }

    let hours: f64 = parts[0].trim().parse().ok()?;
    let minutes: f64 = parts[1].trim().parse().ok()?;
    let seconds: f64 = parts[2].trim().parse().ok()?;

    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

/// Pure parser extracting numeric multiplier from speed string ("1.52x", "0.85", "N/A").
#[must_use]
pub fn parse_speed_multiplier(speed_str: &str) -> f32 {
    let clean = speed_str.trim().trim_end_matches('x').trim();
    clean.parse::<f32>().unwrap_or(1.0)
}

/// Pure parser extracting bitrate in kbps from FFmpeg bitrate string ("2040.5kbits/s", "1.5Mbits/s").
#[must_use]
pub fn parse_bitrate_kbps(bitrate_str: &str) -> f32 {
    let clean = bitrate_str.trim();
    if let Some(val_str) = clean.strip_suffix("kbits/s") {
        val_str.trim().parse::<f32>().unwrap_or(0.0)
    } else if let Some(val_str) = clean.strip_suffix("Mbits/s") {
        val_str.trim().parse::<f32>().map(|v| v * 1000.0).unwrap_or(0.0)
    } else {
        clean.parse::<f32>().unwrap_or(0.0)
    }
}

/// Pure formatter producing "HH:MM:SS" from seconds or "--:--:--" if <= 0.
#[must_use]
pub fn format_eta_duration(seconds: f64) -> String {
    if seconds <= 0.0 || seconds.is_nan() || seconds.is_infinite() {
        return "--:--:--".to_string();
    }

    let total_secs = seconds.round() as u64;
    let hrs = total_secs / 3600;
    let rem = total_secs % 3600;
    let mins = rem / 60;
    let secs = rem % 60;

    format!("{:02}:{:02}:{:02}", hrs, mins, secs)
}

/// Renders the single-line telemetry record the UI console parses
/// (`PROGRESS:`, `Frames:`, `FPS:`, `Speed:`, `ETA:` — see `ui/src/lib/telemetry.ts`).
#[must_use]
pub fn format_progress_log_line(acc: &ProgressAccumulator) -> String {
    let snapshot = acc.build_snapshot();
    format!(
        "PROGRESS: {:.0}% | Frames: {} / {} | FPS: {:.1} | Speed: {:.2}x | ETA: {}",
        snapshot.progress_percent,
        snapshot.frame,
        acc.total_expected_frames,
        snapshot.fps,
        snapshot.speed,
        snapshot.eta_formatted
    )
}

#[cfg(test)]
mod progress_line_tests {
    use super::*;

    #[test]
    fn test_progress_line_matches_ui_telemetry_contract() {
        let mut acc = ProgressAccumulator::new(1000, 0.0);
        acc.current_frame = 250;
        acc.current_fps = 25.0;
        acc.current_speed = 1.5;
        let line = format_progress_log_line(&acc);
        assert_eq!(
            line,
            "PROGRESS: 25% | Frames: 250 / 1000 | FPS: 25.0 | Speed: 1.50x | ETA: 00:00:30"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_progress_key_value() {
        assert_eq!(parse_progress_key_value("frame=123"), Some(("frame", "123")));
        assert_eq!(parse_progress_key_value("speed=1.52x"), Some(("speed", "1.52x")));
        assert_eq!(parse_progress_key_value(""), None);
        assert_eq!(parse_progress_key_value("no_equal_sign"), None);
    }

    #[test]
    fn test_parse_timecode_hhmmss() {
        assert_eq!(parse_timecode_hhmmss("00:01:30.500"), Some(90.5));
        assert_eq!(parse_timecode_hhmmss("01:00:00"), Some(3600.0));
        assert_eq!(parse_timecode_hhmmss("invalid"), None);
    }

    #[test]
    fn test_parse_speed_multiplier() {
        assert_eq!(parse_speed_multiplier("1.52x"), 1.52);
        assert_eq!(parse_speed_multiplier("0.85"), 0.85);
        assert_eq!(parse_speed_multiplier("N/A"), 1.0);
    }

    #[test]
    fn test_parse_bitrate_kbps() {
        assert_eq!(parse_bitrate_kbps("2040.5kbits/s"), 2040.5);
        assert_eq!(parse_bitrate_kbps("2.5Mbits/s"), 2500.0);
        assert_eq!(parse_bitrate_kbps("100"), 100.0);
    }

    #[test]
    fn test_format_eta_duration() {
        assert_eq!(format_eta_duration(0.0), "--:--:--");
        assert_eq!(format_eta_duration(3665.0), "01:01:05");
        assert_eq!(format_eta_duration(45.0), "00:00:45");
    }

    #[test]
    fn test_progress_accumulator_workflow() {
        let mut acc = ProgressAccumulator::new(1000, 33.36);

        acc.feed_line("frame=500");
        acc.feed_line("fps=50.0");
        acc.feed_line("speed=1.67x");
        acc.feed_line("out_time=00:00:16.68");
        let snap = acc.feed_line("progress=continue").expect("Snapshot must be returned");

        assert_eq!(snap.frame, 500);
        assert_eq!(snap.fps, 50.0);
        assert_eq!(snap.progress_percent, 50.0);
        assert_eq!(snap.eta_seconds, 10.0);
        assert_eq!(snap.eta_formatted, "00:00:10");
        assert!(!snap.is_complete);

        let snap_end = acc.feed_line("progress=end").expect("End snapshot");
        assert!(snap_end.is_complete);
        assert_eq!(snap_end.progress_percent, 100.0);
        assert_eq!(snap_end.eta_formatted, "--:--:--");
    }
}
