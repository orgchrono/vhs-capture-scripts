//! Media Probe Data Transfer Objects & Result Models (`probe/models.rs`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RawStream {
    pub index: Option<u32>,
    pub codec_type: Option<String>,
    pub codec_name: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub r_frame_rate: Option<String>,
    pub duration: Option<String>,
    pub nb_frames: Option<String>,
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
