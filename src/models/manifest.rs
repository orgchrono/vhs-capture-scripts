//! Media Lineage & Stage Manifest Model (`models::manifest`).
//!
//! Defines the immutable/value structures for `.manifest.json` companion sidecars,
//! tracking completed analog/AI stages, progressive master state, and SHA-256 source fixity.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::fixity::compute_reader_sha256_hex;
use crate::models::constants::{
    ALL_PIPELINE_STAGES, MANIFEST_SIDECAR_SUFFIX, MASTER_ELIGIBLE_STAGES,
    MEDIA_MANIFEST_SCHEMA_VERSION, STAGE_1_DEINTERLACE_BWDIF, STAGE_1_DEINTERLACE_QTGMC,
};

/// Single audit event recorded when a pipeline stage finishes on a media asset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestStageEvent {
    pub stage: String,
    pub timestamp: String,
    pub params: Value,
}

/// Companion lineage sidecar persisted at `<media_file_path>.manifest.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaManifest {
    pub version: u32,
    pub file_path: String,
    pub source_raw: String,
    pub source_raw_sha256: Option<String>,
    pub created_at: String,
    pub is_progressive: bool,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub completed_stages: Vec<String>,
    pub available_stages: Vec<String>,
    pub history: Vec<ManifestStageEvent>,
}

/// Lightweight projection embedded in `/api/status` file listings for the React UI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaManifestSummary {
    pub is_master: bool,
    pub is_progressive: bool,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub completed_stages: Vec<String>,
    pub available_stages: Vec<String>,
}

impl MediaManifest {
    /// Constructs a new `MediaManifest` and computes `available_stages` automatically.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        file_path: String,
        source_raw: String,
        source_raw_sha256: Option<String>,
        created_at: String,
        is_progressive: bool,
        width: u32,
        height: u32,
        fps: f64,
        completed_stages: Vec<String>,
        history: Vec<ManifestStageEvent>,
    ) -> Self {
        let mut deduped = Vec::new();
        for stage in completed_stages {
            if !deduped.contains(&stage) {
                deduped.push(stage);
            }
        }
        let available_stages = compute_available_stages(is_progressive, &deduped);
        Self {
            version: MEDIA_MANIFEST_SCHEMA_VERSION,
            file_path,
            source_raw,
            source_raw_sha256,
            created_at,
            is_progressive,
            width,
            height,
            fps,
            completed_stages: deduped,
            available_stages,
            history,
        }
    }

    /// Pure transition appending a completed stage and recalculating remaining available stages.
    #[must_use]
    pub fn with_stage_event(
        mut self,
        stage: &str,
        timestamp: &str,
        params: Value,
    ) -> Self {
        if !self.completed_stages.iter().any(|s| s == stage) {
            self.completed_stages.push(stage.to_string());
        }
        if stage == STAGE_1_DEINTERLACE_QTGMC || stage == STAGE_1_DEINTERLACE_BWDIF {
            self.is_progressive = true;
        }
        self.history.push(ManifestStageEvent {
            stage: stage.to_string(),
            timestamp: timestamp.to_string(),
            params,
        });
        self.available_stages = compute_available_stages(self.is_progressive, &self.completed_stages);
        self
    }

    /// Projects this manifest into a compact summary for UI consumption.
    #[must_use]
    pub fn to_summary(&self) -> MediaManifestSummary {
        MediaManifestSummary {
            is_master: self.is_progressive || !self.completed_stages.is_empty(),
            is_progressive: self.is_progressive,
            width: self.width,
            height: self.height,
            fps: self.fps,
            completed_stages: self.completed_stages.clone(),
            available_stages: self.available_stages.clone(),
        }
    }
}

/// Pure function computing which pipeline stages remain eligible for execution.
/// When `is_progressive` is true, destructive Stage 1 analog filters are excluded.
#[must_use]
pub fn compute_available_stages(is_progressive: bool, completed: &[String]) -> Vec<String> {
    let candidate_slice: &[&str] = if is_progressive {
        &MASTER_ELIGIBLE_STAGES
    } else {
        &ALL_PIPELINE_STAGES
    };

    candidate_slice
        .iter()
        .filter(|&&stage| !completed.iter().any(|c| c == stage))
        .map(|&s| s.to_string())
        .collect()
}

/// Resolves the companion `.manifest.json` path for a given media file path.
#[must_use]
pub fn resolve_manifest_path(media_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}{}", media_path.to_string_lossy(), MANIFEST_SIDECAR_SUFFIX))
}

/// Pure JSON serializer for `MediaManifest`.
pub fn serialize_manifest_json(manifest: &MediaManifest) -> Result<String, String> {
    serde_json::to_string_pretty(manifest).map_err(|e| format!("Failed to serialize manifest: {e}"))
}

/// Pure JSON parser for `MediaManifest`.
pub fn parse_manifest_json(json_str: &str) -> Result<MediaManifest, String> {
    serde_json::from_str(json_str).map_err(|e| format!("Failed to parse manifest JSON: {e}"))
}

/// Computes the streaming SHA-256 hex digest of a raw source file for lineage fixity.
pub fn compute_source_file_sha256(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    compute_reader_sha256_hex(file).ok()
}

/// Loads the sidecar `.manifest.json` from disk if it exists and is valid.
#[must_use]
pub fn load_manifest_sidecar(media_path: &Path) -> Option<MediaManifest> {
    let sidecar = resolve_manifest_path(media_path);
    let content = fs::read_to_string(sidecar).ok()?;
    parse_manifest_json(&content).ok()
}

/// Atomically persists the sidecar `.manifest.json` next to `media_path`.
pub fn save_manifest_sidecar(media_path: &Path, manifest: &MediaManifest) -> Result<PathBuf, String> {
    let sidecar_path = resolve_manifest_path(media_path);
    let tmp_path = PathBuf::from(format!("{}.tmp", sidecar_path.to_string_lossy()));
    let json = serialize_manifest_json(manifest)?;
    fs::write(&tmp_path, json).map_err(|e| format!("Failed to write temporary manifest: {e}"))?;
    fs::rename(&tmp_path, &sidecar_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to finalize manifest sidecar: {e}")
    })?;
    Ok(sidecar_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::constants::{
        STAGE_1_AUDIO_EBU_R128, STAGE_1_CHROMA_SHIFT, STAGE_2_AI_FACE_RESTORE,
        STAGE_2_AI_UPSCALER, STAGE_3_BLACKFRAME_TRIM,
    };
    use serde_json::json;

    #[test]
    fn test_manifest_creation_and_available_stages_for_progressive_master() {
        let completed = vec![
            STAGE_1_DEINTERLACE_QTGMC.to_string(),
            STAGE_1_CHROMA_SHIFT.to_string(),
            STAGE_1_AUDIO_EBU_R128.to_string(),
        ];
        let manifest = MediaManifest::new(
            "media/restored/tape01_gold_1080p.mp4".to_string(),
            "media/raw/tape01.mkv".to_string(),
            Some("abc123def456".to_string()),
            "2026-11-01T15:00:00Z".to_string(),
            true,
            1920,
            1080,
            59.94,
            completed,
            vec![],
        );

        assert!(manifest.is_progressive);
        // Destructive Stage 1 filters must NOT be in available_stages
        assert!(!manifest.available_stages.contains(&STAGE_1_CHROMA_SHIFT.to_string()));
        assert!(!manifest.available_stages.contains(&STAGE_1_DEINTERLACE_BWDIF.to_string()));
        // Stage 2 AI and Stage 3 trim must be available
        assert!(manifest.available_stages.contains(&STAGE_2_AI_FACE_RESTORE.to_string()));
        assert!(manifest.available_stages.contains(&STAGE_2_AI_UPSCALER.to_string()));
        assert!(manifest.available_stages.contains(&STAGE_3_BLACKFRAME_TRIM.to_string()));
    }

    #[test]
    fn test_manifest_incremental_stage_update_and_serialization_roundtrip() {
        let manifest = MediaManifest::new(
            "media/restored/tape01.mp4".to_string(),
            "media/raw/tape01.mkv".to_string(),
            None,
            "2026-11-01T15:00:00Z".to_string(),
            true,
            1440,
            1080,
            59.94,
            vec![STAGE_1_DEINTERLACE_QTGMC.to_string()],
            vec![],
        );

        let updated = manifest.with_stage_event(
            STAGE_3_BLACKFRAME_TRIM,
            "2026-11-01T15:05:00Z",
            json!({ "leader_trimmed_sec": 2.4, "trailer_trimmed_sec": 1.1 }),
        );

        assert!(updated.completed_stages.contains(&STAGE_3_BLACKFRAME_TRIM.to_string()));
        assert!(!updated.available_stages.contains(&STAGE_3_BLACKFRAME_TRIM.to_string()));
        assert_eq!(updated.history.len(), 1);

        let serialized = serialize_manifest_json(&updated).expect("serialize ok");
        let parsed = parse_manifest_json(&serialized).expect("parse ok");
        assert_eq!(updated, parsed);
    }

    #[test]
    fn test_manifest_sidecar_disk_persistence() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_manifest_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);
        let video_path = temp_dir.join("master_tape.mp4");
        fs::write(&video_path, b"DUMMY_VIDEO_BYTES").expect("write video");

        let sha = compute_source_file_sha256(&video_path);
        assert!(sha.is_some());

        let manifest = MediaManifest::new(
            video_path.to_string_lossy().to_string(),
            "raw.mkv".to_string(),
            sha,
            "2026-11-01T15:00:00Z".to_string(),
            true,
            1920,
            1080,
            59.94,
            vec![STAGE_1_DEINTERLACE_QTGMC.to_string()],
            vec![],
        );

        let saved_path = save_manifest_sidecar(&video_path, &manifest).expect("save sidecar");
        assert!(saved_path.is_file());

        let loaded = load_manifest_sidecar(&video_path).expect("load sidecar");
        assert_eq!(loaded, manifest);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
