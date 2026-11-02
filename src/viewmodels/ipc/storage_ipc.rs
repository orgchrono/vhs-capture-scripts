//! Tauri IPC Command Handlers: Storage, Quotas, Cloud OAuth, Checkpoint Resumption, and Queue.

use std::path::Path;
use serde_json::{json, Value};
use crate::domain::archive::ArchivalFileEntry;
use crate::domain::queue::{JobRecord, QueueStats};
use crate::infrastructure::storage::{ChunkUploadPart, StorageConfigEnvelope, StorageStatus};

#[tauri::command]
pub fn ipc_compute_sha256(payload: Vec<u8>) -> String {
    crate::viewmodels::storage_vm::ipc_compute_sha256(&payload)
}

#[tauri::command]
pub fn ipc_order_queue(jobs: Vec<JobRecord>) -> Vec<JobRecord> {
    crate::viewmodels::storage_vm::ipc_order_queue(&jobs)
}

#[tauri::command]
pub fn ipc_calculate_queue_stats(jobs: Vec<JobRecord>) -> QueueStats {
    crate::viewmodels::storage_vm::ipc_calculate_queue_stats(&jobs)
}

#[tauri::command]
pub fn ipc_format_destination_key(base_folder: String, relative_path: String) -> String {
    crate::viewmodels::storage_vm::ipc_format_destination_key(&base_folder, &relative_path)
}

#[tauri::command]
pub fn ipc_generate_bagit_manifest(entries: Vec<ArchivalFileEntry>) -> String {
    crate::viewmodels::storage_vm::ipc_generate_bagit_manifest(&entries)
}

#[tauri::command]
pub fn ipc_generate_premis_v3_xml(
    filename: String,
    size_bytes: u64,
    sha256_hex: String,
) -> String {
    crate::viewmodels::storage_vm::ipc_generate_premis_v3_xml(&filename, size_bytes, &sha256_hex)
}

#[tauri::command]
pub fn ipc_evaluate_321_compliance(
    total_copies: usize,
    distinct_media_locations: usize,
    has_remote_or_cloud_copy: bool,
) -> bool {
    crate::viewmodels::storage_vm::ipc_evaluate_321_compliance(
        total_copies,
        distinct_media_locations,
        has_remote_or_cloud_copy,
    )
}

#[tauri::command]
pub fn ipc_build_oauth_auth_url(
    provider: String,
    client_id: String,
    redirect_uri: String,
    state: String,
) -> String {
    let prov = match provider.to_ascii_lowercase().as_str() {
        "dropbox" => crate::infrastructure::oauth::OAuthProvider::Dropbox,
        "onedrive" => crate::infrastructure::oauth::OAuthProvider::OneDrive,
        _ => crate::infrastructure::oauth::OAuthProvider::GDrive,
    };
    crate::viewmodels::storage_vm::ipc_build_oauth_auth_url(
        prov,
        &client_id,
        &redirect_uri,
        &state,
    )
}

#[tauri::command]
pub fn ipc_get_storage_config() -> StorageConfigEnvelope {
    crate::viewmodels::storage_vm::ipc_get_storage_config()
}

#[tauri::command]
pub fn ipc_save_storage_config(
    provider: String,
    config: Value,
) -> Result<StorageStatus, String> {
    crate::viewmodels::storage_vm::ipc_save_storage_config(&provider, &config)
}

#[tauri::command]
pub fn ipc_plan_chunk_upload(
    file_size_bytes: u64,
    chunk_size_bytes: u64,
) -> Vec<ChunkUploadPart> {
    crate::viewmodels::storage_vm::ipc_plan_chunk_upload(file_size_bytes, chunk_size_bytes)
}

#[tauri::command]
pub async fn ipc_copy_storage_file(source: String, destination: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::viewmodels::storage_vm::ipc_copy_storage_file(&source, &destination)
    })
    .await
    .map_err(|e| format!("Worker join error: {e}"))?
}

#[tauri::command]
pub async fn ipc_get_incomplete_jobs() -> Value {
    tauri::async_runtime::spawn_blocking(|| {
        let dirs = crate::viewmodels::api_support::media_dirs();
        let search_dirs = [dirs.restored.clone(), dirs.work.clone()];
        let raw_dirs = [dirs.raw.clone(), dirs.media.clone()];
        let jobs = crate::infrastructure::job_recovery::scan_incomplete_jobs(&search_dirs, &raw_dirs);
        let total = jobs.len();
        json!({
            "incomplete_jobs": jobs,
            "total": total
        })
    })
    .await
    .unwrap_or_else(|_| json!({ "incomplete_jobs": [], "total": 0 }))
}

#[tauri::command]
pub async fn ipc_handle_incomplete_job(
    output_path: String,
    action: String,
    source: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = Path::new(&output_path);
        match action.to_ascii_lowercase().as_str() {
            "finalize" => {
                let ffmpeg_bin = crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", None, None)
                    .ok_or_else(|| "FFmpeg binary could not be resolved.".to_string())?;
                let finalized = crate::infrastructure::job_recovery::finalize_partial_video(target, &ffmpeg_bin)?;
                Ok(json!({
                    "status": "ok",
                    "message": "Partial video container finalized successfully.",
                    "finalized_file": finalized.to_string_lossy()
                }))
            }
            "discard" => {
                let count = crate::infrastructure::job_recovery::discard_incomplete_job(target)?;
                Ok(json!({
                    "status": "ok",
                    "message": format!("Discarded {count} partial files and checkpoint artifacts.")
                }))
            }
            "resume" => {
                Ok(json!({
                    "status": "ok",
                    "message": "Resume planned",
                    "output_path": output_path,
                    "source": source
                }))
            }
            other => Err(format!("Unknown incomplete job action: {other}")),
        }
    })
    .await
    .map_err(|e| format!("Worker join error: {e}"))?
}
