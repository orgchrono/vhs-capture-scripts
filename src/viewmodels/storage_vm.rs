//! Storage, Archival Packaging & Batch Queue ViewModel (`viewmodels::storage_vm`).
//!
//! Exposes typed Tauri IPC commands for SHA-256 fixity, RFC 8493 BagIt manifests,
//! PREMIS v3 metadata, 3-2-1 backup compliance, storage provider persistence,
//! multipart chunk planning, OAuth URLs, and priority queue management.

use crate::domain::archive::{
    evaluate_321_compliance, generate_bagit_declaration, generate_bagit_manifest,
    generate_premis_v3_xml, generate_tape_sidecar_json, ArchivalFileEntry,
};
use crate::domain::fixity::compute_sha256_hex;
use crate::domain::queue::{
    calculate_queue_stats, order_queue, select_next_pending_job, transition_job_status, JobRecord,
    JobStatus, QueueStats,
};
use crate::infrastructure::oauth::{
    build_oauth_auth_url, parse_oauth_token_response, OAuthProvider, OAuthTokenResponse,
};
use crate::infrastructure::storage::{
    calculate_chunk_plan, copy_and_verify_file, format_destination_key,
    load_storage_config_envelope, resolve_storage_config_path, save_storage_config_envelope,
    validate_storage_config, verify_capacity, ChunkUploadPart, StorageConfig,
    StorageConfigEnvelope, StorageStatus,
};

/// Typed IPC ViewModel command computing cryptographic SHA-256 fixity.
#[must_use]
pub fn ipc_compute_sha256(payload: &[u8]) -> String {
    compute_sha256_hex(payload)
}

/// Typed IPC ViewModel command transitioning job lifecycle states.
pub fn ipc_transition_job_status(
    job: JobRecord,
    new_status: JobStatus,
    error_message: Option<String>,
    timestamp: &str,
) -> Result<JobRecord, &'static str> {
    transition_job_status(job, new_status, error_message, timestamp)
}

/// Typed IPC ViewModel command sorting batch jobs by priority and ID.
#[must_use]
pub fn ipc_order_queue(jobs: &[JobRecord]) -> Vec<JobRecord> {
    order_queue(jobs)
}

/// Typed IPC ViewModel command selecting next pending job in queue.
#[must_use]
pub fn ipc_select_next_pending_job(jobs: &[JobRecord]) -> Option<JobRecord> {
    select_next_pending_job(jobs)
}

/// Typed IPC ViewModel command calculating batch queue status metrics.
#[must_use]
pub fn ipc_calculate_queue_stats(jobs: &[JobRecord]) -> QueueStats {
    calculate_queue_stats(jobs)
}

/// Typed IPC ViewModel command validating storage configuration parameters.
pub fn ipc_validate_storage_config(config: &StorageConfig) -> Result<(), &'static str> {
    validate_storage_config(config)
}

/// Typed IPC ViewModel command verifying storage capacity margin.
pub fn ipc_verify_storage_capacity(
    available_bytes: u64,
    required_bytes: u64,
) -> Result<(), &'static str> {
    verify_capacity(available_bytes, required_bytes)
}

/// Typed IPC ViewModel command formatting destination storage object keys.
#[must_use]
pub fn ipc_format_destination_key(base_folder: &str, relative_path: &str) -> String {
    format_destination_key(base_folder, relative_path)
}

/// Typed IPC ViewModel command returning BagIt declaration text.
#[must_use]
pub fn ipc_generate_bagit_declaration() -> &'static str {
    generate_bagit_declaration()
}

/// Typed IPC ViewModel command generating BagIt SHA-256 manifest.
#[must_use]
pub fn ipc_generate_bagit_manifest(entries: &[ArchivalFileEntry]) -> String {
    generate_bagit_manifest(entries)
}

/// Typed IPC ViewModel command generating PREMIS v3 preservation XML.
#[must_use]
pub fn ipc_generate_premis_v3_xml(filename: &str, size_bytes: u64, sha256_hex: &str) -> String {
    generate_premis_v3_xml(filename, size_bytes, sha256_hex)
}

/// Typed IPC ViewModel command generating VHS sidecar JSON metadata.
#[must_use]
pub fn ipc_generate_tape_sidecar_json(
    filename: &str,
    timestamp: f64,
    metadata: &serde_json::Value,
) -> String {
    generate_tape_sidecar_json(filename, timestamp, metadata)
}

/// Typed IPC ViewModel command evaluating 3-2-1 archival backup compliance.
#[must_use]
pub fn ipc_evaluate_321_compliance(
    total_copies: usize,
    distinct_media_locations: usize,
    has_remote_or_cloud_copy: bool,
) -> bool {
    evaluate_321_compliance(
        total_copies,
        distinct_media_locations,
        has_remote_or_cloud_copy,
    )
}

/// Typed IPC ViewModel command building OAuth authorization redirect URL.
#[must_use]
pub fn ipc_build_oauth_auth_url(
    provider: OAuthProvider,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
) -> String {
    build_oauth_auth_url(provider, client_id, redirect_uri, state)
}

/// Typed IPC ViewModel command parsing OAuth token response JSON.
pub fn ipc_parse_oauth_token_response(json_body: &str) -> Result<OAuthTokenResponse, String> {
    parse_oauth_token_response(json_body)
}

/// Typed IPC ViewModel command returning the persistent storage configuration and status.
#[must_use]
pub fn ipc_get_storage_config() -> StorageConfigEnvelope {
    let path = resolve_storage_config_path();
    load_storage_config_envelope(&path)
}

/// Typed IPC ViewModel command updating and saving storage configuration atomically.
pub fn ipc_save_storage_config(
    provider: &str,
    config: &serde_json::Value,
) -> Result<StorageStatus, String> {
    let path = resolve_storage_config_path();
    save_storage_config_envelope(&path, provider, config)
}

/// Typed IPC ViewModel command evaluating chunk upload plan for large files.
#[must_use]
pub fn ipc_plan_chunk_upload(file_size_bytes: u64, chunk_size_bytes: u64) -> Vec<ChunkUploadPart> {
    calculate_chunk_plan(file_size_bytes, chunk_size_bytes)
}

/// Typed IPC ViewModel command safely copying and verifying archival file transfer.
pub fn ipc_copy_storage_file(source: &str, destination: &str) -> Result<u64, String> {
    copy_and_verify_file(
        std::path::Path::new(source),
        std::path::Path::new(destination),
    )
}
