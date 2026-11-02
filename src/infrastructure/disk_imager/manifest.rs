//! Forensic Manifests & Fixity Sidecar Generation (`disk_imager/manifest.rs`).

use std::path::Path;
use crate::domain::disk_imager::{
    coalesce_sector_errors, format_nist_sha256_sidecar, ForensicDumpReport, SectorError,
};
use crate::models::constants::{DUMP_LOG_SIDECAR_SUFFIX, SHA256_SIDECAR_SUFFIX};

pub fn promote_part_to_final_image(part_target: &Path, output_target: &Path) -> Result<(), String> {
    if output_target.exists() {
        let _ = std::fs::remove_file(output_target);
    }
    std::fs::rename(part_target, output_target)
        .map_err(|e| format!("Failed to promote disk image file: {e}"))
}

pub fn write_sha256_sidecar(output_image_path: &str, sha256_hex: &str) {
    let sha256_sidecar_path = format!("{output_image_path}{SHA256_SIDECAR_SUFFIX}");
    let content = format_nist_sha256_sidecar(sha256_hex, output_image_path);
    let _ = std::fs::write(&sha256_sidecar_path, content);
}

pub struct DumpReportParams<'a> {
    pub source_device_id: &'a str,
    pub output_image_path: &'a str,
    pub sha256_hex: &'a str,
    pub dev_total_bytes: u64,
    pub processed_bytes: u64,
    pub sector_size: u32,
    pub bad_sectors: u64,
    pub zero_filled_bytes: u64,
    pub peak_speed_mbps: f64,
    pub elapsed_total: f64,
    pub sector_errors: &'a [SectorError],
}

pub fn build_and_write_dump_report(params: DumpReportParams<'_>) -> ForensicDumpReport {
    let avg_speed = if params.elapsed_total > 0.0 {
        ((params.processed_bytes as f64 / (1024.0 * 1024.0)) / params.elapsed_total * 100.0).round() / 100.0
    } else {
        0.0
    };

    let coalesced_errors = coalesce_sector_errors(params.sector_errors);
    let dump_report = ForensicDumpReport {
        schema_version: 1,
        source_device_id: params.source_device_id.to_string(),
        device_model: "Direct Block Device".to_string(),
        device_serial: "FORENSIC-RAW-INGEST".to_string(),
        output_image_path: params.output_image_path.to_string(),
        sha256_hex: params.sha256_hex.to_string(),
        total_bytes_expected: params.dev_total_bytes,
        total_bytes_written: params.processed_bytes,
        sector_size_bytes: params.sector_size,
        total_sectors_read: if params.sector_size > 0 {
            params.processed_bytes / (params.sector_size as u64)
        } else {
            0
        },
        damaged_sector_count: params.bad_sectors,
        zero_filled_bytes: params.zero_filled_bytes,
        average_speed_mbps: avg_speed,
        peak_speed_mbps: params.peak_speed_mbps,
        elapsed_seconds: (params.elapsed_total * 100.0).round() / 100.0,
        damaged_lba_ranges: coalesced_errors,
    };

    let log_path = format!("{}{DUMP_LOG_SIDECAR_SUFFIX}", params.output_image_path);
    if let Ok(dump_json) = serde_json::to_string_pretty(&dump_report) {
        let _ = std::fs::write(&log_path, dump_json);
    }

    dump_report
}
