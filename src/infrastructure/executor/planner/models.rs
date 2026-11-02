use serde::{Deserialize, Serialize};
use crate::pipeline::{AudioChannelPolicy, DeinterlaceFilter, OutputCodec, PipelinePlan};
use crate::presets::RestorationPreset;

/// Maximum stderr tail (bytes) retained for failure diagnostics.
pub const STDERR_TAIL_MAX_BYTES: usize = 8 * 1024;

/// Optional per-job overrides taking precedence over the selected preset (SSOT: `PresetConfig`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RestorationOverrides {
    pub crf: Option<u8>,
    pub chroma_fix: Option<bool>,
    pub denoise: Option<bool>,
    pub comb_filter: Option<bool>,
    pub overscan_blanking: Option<bool>,
    pub dropout_clean: Option<bool>,
    pub audio_offset_sec: Option<f64>,
    #[serde(default)]
    pub ai_face_restore: Option<bool>,
    #[serde(default)]
    pub ai_face_fidelity: Option<f32>,
    #[serde(default)]
    pub ai_rife_60fps: Option<bool>,
    #[serde(default)]
    pub ai_upscaler: Option<bool>,
    #[serde(default)]
    pub ai_upscaler_model: Option<String>,
}

/// Declarative user request to execute a restoration job.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestorationJobRequest {
    pub input_path: String,
    pub output_dir: String,
    pub preset: RestorationPreset,
    #[serde(default)]
    pub target_1080p: bool,
    #[serde(default)]
    pub output_codec: Option<OutputCodec>,
    #[serde(default)]
    pub custom_deinterlacer: Option<DeinterlaceFilter>,
    #[serde(default)]
    pub audio_policy: Option<AudioChannelPolicy>,
    #[serde(default)]
    pub apply_audio_notch_hum: bool,
    #[serde(default)]
    pub apply_loudness_norm: bool,
    #[serde(default)]
    pub apply_ai_audio_denoise: bool,
    #[serde(default)]
    pub apply_azimuth_correction: bool,
    #[serde(default)]
    pub start_sec: f64,
    #[serde(default)]
    pub base_start_sec: Option<f64>,
    #[serde(default)]
    pub duration_sec: Option<f64>,
    #[serde(default)]
    pub overrides: RestorationOverrides,
}

/// Fully planned restoration ready for subprocess invocation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlannedRestoration {
    pub input_path: String,
    pub final_output_path: String,
    pub part_output_path: String,
    pub plan: PipelinePlan,
    pub is_qtgmc_active: bool,
    pub qtgmc_vpy_content: Option<String>,
    pub qtgmc_vpy_path: Option<String>,
    pub ffmpeg_cli_args: Vec<String>,
    pub vspipe_cli_args: Option<Vec<String>>,
    pub expected_frames: u64,
    pub expected_duration_sec: f64,
    pub request_json: Option<String>,
    #[serde(default)]
    pub master_guard_bypassed: bool,
}

/// Completed restoration telemetry report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestorationSummary {
    pub input_path: String,
    pub final_output_path: String,
    pub total_frames_processed: u64,
    pub total_duration_sec: f64,
    pub duration_formatted: String,
    pub elapsed_wall_clock_sec: f64,
    pub average_fps: f32,
    pub sha256_checksum: String,
    pub success: bool,
    pub error_message: Option<String>,
}
