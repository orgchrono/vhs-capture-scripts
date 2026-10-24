//! Pure Restoration Recovery and Incomplete Job Models (`models::recovery`).
//!
//! Strongly-typed domain models representing interrupted jobs, partial container descriptors,
//! and existing restoration state checks conforming to the frontend TypeScript contract.

use serde::{Deserialize, Serialize};

/// Diagnostic descriptor of an interrupted or in-progress restoration job.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IncompleteJob {
    pub job_id: String,
    pub source_file: String,
    pub output_file: String,
    pub checkpoint_file: String,
    pub status: String,
    pub processed_frames: u64,
    pub total_expected_frames: u64,
    pub progress_percent: f64,
    pub elapsed_seconds: f64,
    pub fps: f64,
    pub output_size_bytes: u64,
    pub last_modified: String,
    pub can_resume: bool,
    pub source_exists: bool,
}

/// Result of checking whether a previous or partial restoration exists for a source tape.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ExistingRestorationCheck {
    pub has_existing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_resume: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_percent: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
}

/// Payload sent by the frontend to perform an action on an incomplete job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncompleteJobActionPayload {
    pub output_path: String,
    pub action: String, // "resume" | "finalize" | "discard"
    pub source: Option<String>,
}
