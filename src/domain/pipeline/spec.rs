//! Pure declarative parameter specifications for video/audio pipeline planning.

use serde::{Deserialize, Serialize};

/// Broadcast color standard compliance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorStandard {
    Smpte170m, // NTSC / 480i / 480p standard
    Bt601_625, // PAL / 576i / 576p standard
    Bt709,     // Rec. 709 HDTV (1080p remaster)
}

/// Supported hardware encoders with capability-based fallback.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VideoEncoder {
    Libx264,
    Libx265,
    H264Nvenc,
    HevcNvenc,
    H264Amf,
    HevcAmf,
    H264Videotoolbox,
    HevcVideotoolbox,
    H264Qsv,
    HevcQsv,
    H264Vaapi,
    ProResKs,
    Ffv1,
}

/// Output video container and codec format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputCodec {
    H264,
    Hevc,
    ProRes,
    Ffv1,
}

/// Native IVTC (Inverse Telecine / 3:2 pulldown reversal) filterchain (29.97i -> 23.976p).
pub const FILTER_IVTC_PULLDOWN: &str = crate::models::constants::FILTER_IVTC_PULLDOWN;

/// Professional audio azimuth alignment and high-shelf air restoration filterchain.
pub const FILTER_AUDIO_AZIMUTH_HIGH_SHELF: &str = crate::models::constants::FILTER_AUDIO_AZIMUTH_HIGH_SHELF;

/// Deinterlacer filter algorithms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeinterlaceFilter {
    Qtgmc,
    BwdifBob,
    BwdifSingle,
    Znedi3,
    Nnedi3,
    Yadif,
    Ivtc,
    None,
}

/// Audio channel configuration policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioChannelPolicy {
    Stereo,
    MonoLeft,  // Duplicate clean left track to right
    MonoRight, // Duplicate clean right track to left
    MonoSum,   // Symmetrical sum of left and right channels
    Passthrough,
}

/// Pure declarative input parameters for the restoration pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineSpec {
    pub input_path: String,
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub target_1080p: bool,
    pub crf: u8,
    pub output_codec: OutputCodec,
    pub encoder: VideoEncoder,
    pub deinterlacer: DeinterlaceFilter,
    pub apply_chroma_fix: bool,
    pub apply_denoise: bool,
    pub apply_comb_filter: bool,
    pub apply_overscan_blanking: bool,
    pub apply_dropout_clean: bool,
    pub audio_policy: AudioChannelPolicy,
    pub apply_audio_notch_hum: bool,
    pub apply_loudness_norm: bool,
    #[serde(default)]
    pub apply_ai_audio_denoise: bool,
    #[serde(default)]
    pub apply_azimuth_correction: bool,
    pub start_sec: f64,
    pub audio_offset_sec: f64,
    pub duration_sec: Option<f64>,
}

/// Fully resolved, immutable execution plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PipelinePlan {
    pub video_filtergraph: String,
    pub audio_filtergraph: String,
    pub encoder_args: Vec<String>,
    pub audio_args: Vec<String>,
    pub input_timing_args: Vec<String>,
    pub output_path: String,
}

/// Specification for preview and frame comparison filtergraphs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ComparisonPreviewSpec {
    pub deinterlacer: String,
    pub denoise: bool,
    pub chroma_fix: bool,
    pub comb_filter: bool,
    pub overscan: bool,
    pub dropout: bool,
    pub target_width: u32,
    pub target_height: u32,
}
