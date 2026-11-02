//! Quality Control data models and broadcast standard constants.

use serde::{Deserialize, Serialize};

/// Canonical 8-bit ITU-R BT.601 / SMPTE 170M standard signal thresholds.
pub const BT601_LEGAL_LUMA_MIN: u8 = 16;
pub const BT601_LEGAL_LUMA_MAX: u8 = 235;
pub const BT601_LEGAL_CHROMA_MIN: u8 = 16;
pub const BT601_LEGAL_CHROMA_MAX: u8 = 240;
pub const BT601_CHROMA_CENTER: u8 = 128;

/// Dropout detection sensitivity thresholds.
pub const DROPOUT_MIN_LINE_VARIATION: f32 = 45.0;
pub const FREEZE_FRAME_MSE_THRESHOLD: f32 = 0.85;

/// Broadcast Gamut Compliance status as an Algebraic Data Type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GamutCompliance {
    Compliant,
    ExcursionUnderflow,
    ExcursionOverflow,
    ChromaExcursion,
    MultipleViolations,
}

/// Pure metrics computed from a video frame's luma channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LumaMetrics {
    pub min_luma: u8,
    pub max_luma: u8,
    pub mean_luma: f32,
    pub std_dev: f32,
    pub underflow_pixel_count: usize,
    pub overflow_pixel_count: usize,
}

/// Pure metrics computed from a video frame's chroma channels (Cb/Cr or U/V).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChromaMetrics {
    pub mean_u: f32,
    pub mean_v: f32,
    pub u_excursion_count: usize,
    pub v_excursion_count: usize,
}

/// Comprehensive Frame Quality Control Assessment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameQcReport {
    pub luma: LumaMetrics,
    pub chroma: ChromaMetrics,
    pub gamut_status: GamutCompliance,
    pub is_legal_broadcast: bool,
    pub dropout_lines_detected: usize,
}

/// Comprehensive tape file QC inspection summary.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileQcAssessment {
    pub file_path: String,
    pub width: u32,
    pub height: u32,
    pub duration_sec: f64,
    pub total_frames: u64,
    pub standard: String,
    pub black_leader_sec: f64,
    pub is_interlaced: bool,
    pub is_legal_broadcast: bool,
    pub total_dropout_frames: u64,
    pub total_frozen_frames: u64,
    pub min_luma: u8,
    pub max_luma: u8,
    pub avg_luma: f32,
}

/// Recorded action by an individual restoration filter or tool in the pipeline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PipelineToolRecord {
    pub tool_id: String,
    pub tool_name: String,
    pub stage: String,
    pub engine: String,
    pub status: String,
    pub frames_affected: u64,
    pub correction_summary: String,
}

/// Comprehensive before/after restoration comparison report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RestorationComparativeReport {
    pub raw: FileQcAssessment,
    pub master: FileQcAssessment,
    pub tools_applied: Vec<PipelineToolRecord>,
    pub dropouts_mitigated: u64,
    pub broadcast_compliance_achieved: bool,
    pub resolution_improvement: String,
    pub audio_treatment_applied: String,
}
