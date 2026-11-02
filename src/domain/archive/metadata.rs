//! Digital Preservation Metadata & Archival Compliance (`domain/archive/metadata.rs`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TapeSidecarMetadata {
    pub version: String,
    pub timestamp: f64,
    pub original_file: String,
    pub metadata: serde_json::Value,
}

/// Pure tape sidecar metadata JSON generator.
#[must_use]
pub fn generate_tape_sidecar_json(
    filename: &str,
    timestamp: f64,
    metadata: &serde_json::Value,
) -> String {
    let payload = TapeSidecarMetadata {
        version: "1.0".to_string(),
        timestamp,
        original_file: filename.to_string(),
        metadata: metadata.clone(),
    };
    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
}

/// Evaluates whether an archival backup plan satisfies the 3-2-1 digital preservation rule:
/// At least 3 copies, on 2 different media formats/locations, with at least 1 offsite/cloud copy.
#[must_use]
pub fn evaluate_321_compliance(
    total_copies: usize,
    distinct_media_locations: usize,
    has_remote_or_cloud_copy: bool,
) -> bool {
    total_copies >= 3 && distinct_media_locations >= 2 && has_remote_or_cloud_copy
}

/// Cryptographic fixity verification report for an OAIS package directory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OaisVerificationReport {
    pub package_dir: String,
    pub manifest_file: String,
    pub total_files_checked: usize,
    pub valid_files: Vec<String>,
    pub corrupted_files: Vec<String>,
    pub missing_files: Vec<String>,
    pub is_valid: bool,
}
