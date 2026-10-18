//! Advanced Architectural Configuration Engine (TOML Parser).
//!
//! Pure functional parsing of `vhs_advanced_config.toml` sections:
//! `[capture]`, `[vapoursynth]`, and `[ffmpeg]` without external parser dependencies.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CaptureAdvancedConfig {
    pub audio_threshold_db: f32,
    pub start_confirm_sec: f32,
    pub stop_blank_confirm_sec: f32,
    pub stop_quiet_scene_sec: f32,
    pub screenshot_interval_sec: f32,
}

impl Default for CaptureAdvancedConfig {
    fn default() -> Self {
        Self {
            audio_threshold_db: -50.0,
            start_confirm_sec: 0.10,
            stop_blank_confirm_sec: 3.5,
            stop_quiet_scene_sec: 25.0,
            screenshot_interval_sec: 0.25,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VapourSynthAdvancedConfig {
    pub qtgmc_preset_gold: String,
    pub qtgmc_preset_speed: String,
    pub chroma_shift_x: i32,
    pub chroma_shift_y: i32,
}

impl Default for VapourSynthAdvancedConfig {
    fn default() -> Self {
        Self {
            qtgmc_preset_gold: "Slower".to_string(),
            qtgmc_preset_speed: "Faster".to_string(),
            chroma_shift_x: -2,
            chroma_shift_y: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FFmpegAdvancedConfig {
    pub crf_gold: u32,
    pub crf_speed: u32,
    pub crf_tbc_hold: u32,
    pub crf_ai_master: u32,
    pub scene_threshold: f32,
}

impl Default for FFmpegAdvancedConfig {
    fn default() -> Self {
        Self {
            crf_gold: 18,
            crf_speed: 22,
            crf_tbc_hold: 20,
            crf_ai_master: 16,
            scene_threshold: 27.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct AdvancedConfig {
    pub capture: CaptureAdvancedConfig,
    pub vapoursynth: VapourSynthAdvancedConfig,
    pub ffmpeg: FFmpegAdvancedConfig,
}

/// Pure TOML parser for `vhs_advanced_config.toml` content.
#[must_use]
pub fn parse_advanced_toml(toml_str: &str) -> AdvancedConfig {
    let mut config = AdvancedConfig::default();
    let mut current_section = "";

    for line in toml_str.lines() {
        let clean = match line.split_once('#') {
            Some((before, _)) => before.trim(),
            None => line.trim(),
        };

        if clean.is_empty() {
            continue;
        }

        if clean.starts_with('[') && clean.ends_with(']') {
            current_section = &clean[1..clean.len() - 1].trim();
            continue;
        }

        if let Some((raw_key, raw_val)) = clean.split_once('=') {
            let key = raw_key.trim();
            let val = raw_val.trim().trim_matches('"');

            match current_section {
                "capture" => match key {
                    "audio_threshold_db" => {
                        if let Ok(v) = val.parse::<f32>() {
                            config.capture.audio_threshold_db = v;
                        }
                    }
                    "start_confirm_sec" => {
                        if let Ok(v) = val.parse::<f32>() {
                            config.capture.start_confirm_sec = v;
                        }
                    }
                    "stop_blank_confirm_sec" => {
                        if let Ok(v) = val.parse::<f32>() {
                            config.capture.stop_blank_confirm_sec = v;
                        }
                    }
                    "stop_quiet_scene_sec" => {
                        if let Ok(v) = val.parse::<f32>() {
                            config.capture.stop_quiet_scene_sec = v;
                        }
                    }
                    "screenshot_interval_sec" => {
                        if let Ok(v) = val.parse::<f32>() {
                            config.capture.screenshot_interval_sec = v;
                        }
                    }
                    _ => {}
                },
                "vapoursynth" => match key {
                    "qtgmc_preset_gold" => {
                        config.vapoursynth.qtgmc_preset_gold = val.to_string();
                    }
                    "qtgmc_preset_speed" => {
                        config.vapoursynth.qtgmc_preset_speed = val.to_string();
                    }
                    "chroma_shift_x" => {
                        if let Ok(v) = val.parse::<i32>() {
                            config.vapoursynth.chroma_shift_x = v;
                        }
                    }
                    "chroma_shift_y" => {
                        if let Ok(v) = val.parse::<i32>() {
                            config.vapoursynth.chroma_shift_y = v;
                        }
                    }
                    _ => {}
                },
                "ffmpeg" => match key {
                    "crf_gold" => {
                        if let Ok(v) = val.parse::<u32>() {
                            config.ffmpeg.crf_gold = v;
                        }
                    }
                    "crf_speed" => {
                        if let Ok(v) = val.parse::<u32>() {
                            config.ffmpeg.crf_speed = v;
                        }
                    }
                    "crf_tbc_hold" => {
                        if let Ok(v) = val.parse::<u32>() {
                            config.ffmpeg.crf_tbc_hold = v;
                        }
                    }
                    "crf_ai_master" => {
                        if let Ok(v) = val.parse::<u32>() {
                            config.ffmpeg.crf_ai_master = v;
                        }
                    }
                    "scene_threshold" => {
                        if let Ok(v) = val.parse::<f32>() {
                            config.ffmpeg.scene_threshold = v;
                        }
                    }
                    _ => {}
                },
                _ => {}
            }
        }
    }

    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_advanced_toml_full() {
        let sample = r#"
        [capture]
        audio_threshold_db = -45.0
        start_confirm_sec = 0.20
        stop_blank_confirm_sec = 4.0
        stop_quiet_scene_sec = 30.0
        screenshot_interval_sec = 0.5

        [vapoursynth]
        qtgmc_preset_gold = "Placebo"
        qtgmc_preset_speed = "Medium"
        chroma_shift_x = -4
        chroma_shift_y = 2

        [ffmpeg]
        crf_gold = 17
        crf_speed = 21
        crf_tbc_hold = 19
        crf_ai_master = 15
        scene_threshold = 28.5
        "#;

        let conf = parse_advanced_toml(sample);
        assert_eq!(conf.capture.audio_threshold_db, -45.0);
        assert_eq!(conf.capture.start_confirm_sec, 0.20);
        assert_eq!(conf.capture.stop_blank_confirm_sec, 4.0);
        assert_eq!(conf.vapoursynth.qtgmc_preset_gold, "Placebo");
        assert_eq!(conf.vapoursynth.chroma_shift_x, -4);
        assert_eq!(conf.ffmpeg.crf_gold, 17);
        assert_eq!(conf.ffmpeg.scene_threshold, 28.5);
    }

    #[test]
    fn test_parse_advanced_toml_empty_uses_defaults() {
        let conf = parse_advanced_toml("");
        assert_eq!(conf.capture.audio_threshold_db, -50.0);
        assert_eq!(conf.vapoursynth.qtgmc_preset_gold, "Slower");
        assert_eq!(conf.ffmpeg.crf_gold, 18);
    }
}
