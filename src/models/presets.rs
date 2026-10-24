//! Canonical Single Source of Truth (SSOT) for Broadcast Restoration Presets.
//!
//! Models presets and pipeline modes as immutable Algebraic Data Types (ADTs)
//! with pure deterministic transformation functions.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestorationPreset {
    Gold,
    Speed,
    TbcHold,
    AiMaster,
    Custom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Deinterlacer {
    Bwdif,
    Yadif,
    Qtgmc,
    QtgmcFast,
    QtgmcSlow,
    Nnedi,
    Znedi3,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VideoMode {
    Double,
    Single,
    Freeze,
    Drop,
    Passthrough,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioMode {
    Auto,
    Stereo,
    Mono,
    MonoL,
    MonoR,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutputCodec {
    H264,
    Hevc,
    Prores,
    Ffv1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResolutionMode {
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "1080p")]
    Upscale1080p,
}

/// Canonical CRF constants synchronized across Rust, Python, and TypeScript SSOT layers.
pub const CRF_AI_MASTER: u8 = 16;
pub const CRF_GOLD: u8 = 18;
pub const CRF_TBC_HOLD: u8 = 20;
pub const CRF_SPEED: u8 = 22;
pub const DEFAULT_FACE_FIDELITY_MILLIS: u16 = 700;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PresetConfig {
    pub preset: RestorationPreset,
    pub deinterlacer: Deinterlacer,
    pub mode: VideoMode,
    pub audio_mode: AudioMode,
    pub output_codec: OutputCodec,
    pub resolution: ResolutionMode,
    pub crf: u8,
    pub chroma_fix: bool,
    pub denoise: bool,
    pub comb_filter: bool,
    pub overscan_blanking: bool,
    pub audio_treatment: bool,
    pub dropout_clean: bool,
    pub ai_audio_denoise: bool,
    pub ai_face_restore: bool,
    pub ai_face_fidelity_millis: u16,
    pub ai_rife_60fps: bool,
    pub ai_upscaler: bool,
}

impl PresetConfig {
    /// Pure total function mapping a `RestorationPreset` ADT variant to its canonical configuration.
    #[must_use]
    pub const fn from_preset(preset: RestorationPreset) -> Self {
        match preset {
            RestorationPreset::Gold | RestorationPreset::Custom => Self {
                preset,
                deinterlacer: Deinterlacer::Qtgmc,
                mode: VideoMode::Passthrough,
                audio_mode: AudioMode::Auto,
                output_codec: OutputCodec::H264,
                resolution: ResolutionMode::Upscale1080p,
                crf: CRF_GOLD,
                chroma_fix: true,
                denoise: false,
                comb_filter: true,
                overscan_blanking: true,
                audio_treatment: true,
                dropout_clean: false,
                ai_audio_denoise: false,
                ai_face_restore: false,
                ai_face_fidelity_millis: DEFAULT_FACE_FIDELITY_MILLIS,
                ai_rife_60fps: false,
                ai_upscaler: false,
            },
            RestorationPreset::Speed => Self {
                preset: RestorationPreset::Speed,
                deinterlacer: Deinterlacer::Bwdif,
                mode: VideoMode::Passthrough,
                audio_mode: AudioMode::Auto,
                output_codec: OutputCodec::H264,
                resolution: ResolutionMode::Upscale1080p,
                crf: CRF_SPEED,
                chroma_fix: false,
                denoise: false,
                comb_filter: false,
                overscan_blanking: true,
                audio_treatment: false,
                dropout_clean: false,
                ai_audio_denoise: false,
                ai_face_restore: false,
                ai_face_fidelity_millis: DEFAULT_FACE_FIDELITY_MILLIS,
                ai_rife_60fps: false,
                ai_upscaler: false,
            },
            RestorationPreset::TbcHold => Self {
                preset: RestorationPreset::TbcHold,
                deinterlacer: Deinterlacer::Znedi3,
                mode: VideoMode::Freeze,
                audio_mode: AudioMode::MonoL,
                output_codec: OutputCodec::H264,
                resolution: ResolutionMode::Upscale1080p,
                crf: CRF_TBC_HOLD,
                chroma_fix: true,
                denoise: true,
                comb_filter: true,
                overscan_blanking: true,
                audio_treatment: true,
                dropout_clean: true,
                ai_audio_denoise: false,
                ai_face_restore: false,
                ai_face_fidelity_millis: DEFAULT_FACE_FIDELITY_MILLIS,
                ai_rife_60fps: false,
                ai_upscaler: false,
            },
            RestorationPreset::AiMaster => Self {
                preset: RestorationPreset::AiMaster,
                deinterlacer: Deinterlacer::Qtgmc,
                mode: VideoMode::Freeze,
                audio_mode: AudioMode::Auto,
                output_codec: OutputCodec::H264,
                resolution: ResolutionMode::Upscale1080p,
                crf: CRF_AI_MASTER,
                chroma_fix: true,
                denoise: true,
                comb_filter: false,
                overscan_blanking: true,
                audio_treatment: true,
                dropout_clean: true,
                ai_audio_denoise: true,
                ai_face_restore: true,
                ai_face_fidelity_millis: DEFAULT_FACE_FIDELITY_MILLIS,
                ai_rife_60fps: true,
                ai_upscaler: true,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_preset_crfs_match_ssot() {
        assert_eq!(PresetConfig::from_preset(RestorationPreset::Gold).crf, 18);
        assert_eq!(PresetConfig::from_preset(RestorationPreset::Speed).crf, 22);
        assert_eq!(PresetConfig::from_preset(RestorationPreset::TbcHold).crf, 20);
        assert_eq!(PresetConfig::from_preset(RestorationPreset::AiMaster).crf, 16);
    }

    #[test]
    fn tbc_hold_enables_freeze_and_znedi3() {
        let cfg = PresetConfig::from_preset(RestorationPreset::TbcHold);
        assert_eq!(cfg.deinterlacer, Deinterlacer::Znedi3);
        assert_eq!(cfg.mode, VideoMode::Freeze);
        assert_eq!(cfg.audio_mode, AudioMode::MonoL);
        assert!(cfg.dropout_clean);
    }

    #[test]
    fn ai_master_and_gold_enforce_qtgmc_deinterlacing() {
        assert_eq!(PresetConfig::from_preset(RestorationPreset::Gold).deinterlacer, Deinterlacer::Qtgmc);
        assert_eq!(PresetConfig::from_preset(RestorationPreset::AiMaster).deinterlacer, Deinterlacer::Qtgmc);
    }
}
