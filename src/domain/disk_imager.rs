//! Pure Functional Domain Models & Calculators for Raw Block Device Imaging (`domain::disk_imager`).
//!
//! Zero OS I/O side effects. Handles sector alignment math, `conv=noerror,sync` fallback
//! range decomposition, 4 Hz telemetry calculations, and forensic sidecar formatting.

use crate::models::constants::{
    DISK_IMAGER_PRIMARY_CHUNK_BYTES, DISK_SECTOR_SIZE_512,
    DISK_SECTOR_SIZE_4K, DISK_SECTOR_SIZE_OPTICAL_2048,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiskMediaKind {
    OpticalDvdRam,
    OpticalDvdVr,
    PanasonicHddMeihdfs,
    FlashCardMedia,
    GenericBlockDevice,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiskDevice {
    pub device_id: String,
    pub display_name: String,
    pub model: String,
    pub serial_number: String,
    pub total_bytes: u64,
    pub sector_size_bytes: u32,
    pub media_kind: DiskMediaKind,
    pub is_removable: bool,
    pub is_optical: bool,
    pub is_panasonic: bool,
    pub bus_type: String,
    pub requires_elevation: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageContainerFormat {
    Img,
    Bin,
    Iso,
}

impl ImageContainerFormat {
    #[must_use]
    pub const fn extension(&self) -> &'static str {
        match self {
            Self::Img => "img",
            Self::Bin => "bin",
            Self::Iso => "iso",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImagingConfig {
    pub source_device_id: String,
    pub output_image_path: String,
    pub container_format: ImageContainerFormat,
    pub primary_chunk_bytes: usize,
    pub physical_sector_bytes: u32,
    pub max_sector_retries: u8,
    pub zero_fill_corrupt_sectors: bool,
    pub compute_sha256_sidecar: bool,
    pub auto_chain_restoration: bool,
    pub auto_enqueue_preset: Option<String>,
}

impl Default for ImagingConfig {
    fn default() -> Self {
        Self {
            source_device_id: String::new(),
            output_image_path: String::new(),
            container_format: ImageContainerFormat::Img,
            primary_chunk_bytes: DISK_IMAGER_PRIMARY_CHUNK_BYTES,
            physical_sector_bytes: DISK_SECTOR_SIZE_512,
            max_sector_retries: 2,
            zero_fill_corrupt_sectors: true,
            compute_sha256_sidecar: true,
            auto_chain_restoration: true,
            auto_enqueue_preset: Some("gold".to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SectorErrorKind {
    CrcDataError,
    SectorNotFound,
    DeviceIoTimeout,
    PermissionDenied,
    MediaRemoved,
    UnknownOsError(i32),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SectorError {
    pub start_lba: u64,
    pub sector_count: u64,
    pub byte_offset: u64,
    pub byte_length: u64,
    pub error_kind: SectorErrorKind,
    pub retries_attempted: u8,
    pub zero_padded: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SectorBucketHealth {
    Pending,
    VerifiedGood,
    RetriedRecovered,
    ZeroFilledDamaged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImagingPhase {
    Idle,
    LockingVolume,
    StreamingBlocks,
    RecoveringBadSectors,
    FinalizingFixity,
    CarvingStreams,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImagingTelemetry {
    pub phase: ImagingPhase,
    pub source_device_id: String,
    pub output_image_path: String,
    pub current_lba: u64,
    pub total_lba: u64,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub progress_percent: f64,
    pub throughput_mbps: f64,
    pub eta_seconds: u64,
    pub retried_sector_count: u64,
    pub bad_sector_count: u64,
    pub zero_filled_bytes: u64,
    pub sector_map_buckets: Vec<SectorBucketHealth>,
    pub sha256_hex: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ForensicDumpReport {
    pub schema_version: u32,
    pub source_device_id: String,
    pub device_model: String,
    pub device_serial: String,
    pub output_image_path: String,
    pub sha256_hex: String,
    pub total_bytes_expected: u64,
    pub total_bytes_written: u64,
    pub sector_size_bytes: u32,
    pub total_sectors_read: u64,
    pub damaged_sector_count: u64,
    pub zero_filled_bytes: u64,
    pub average_speed_mbps: f64,
    pub peak_speed_mbps: f64,
    pub elapsed_seconds: f64,
    pub damaged_lba_ranges: Vec<SectorError>,
}

/// Pure normalization of physical sector size to a valid power-of-two boundary (512, 2048, or 4096).
#[must_use]
pub const fn normalize_sector_size(reported_sector_bytes: u32, is_optical: bool) -> u32 {
    if is_optical && reported_sector_bytes == 0 {
        return DISK_SECTOR_SIZE_OPTICAL_2048;
    }
    match reported_sector_bytes {
        DISK_SECTOR_SIZE_512 | DISK_SECTOR_SIZE_OPTICAL_2048 | DISK_SECTOR_SIZE_4K => {
            reported_sector_bytes
        }
        s if s > 0 && s.is_power_of_two() && s >= 512 && s <= 65536 => s,
        _ => DISK_SECTOR_SIZE_512,
    }
}

/// Pure alignment of any byte count upward to the nearest physical sector boundary.
#[must_use]
pub const fn align_up_to_sector(byte_len: usize, sector_size: u32) -> usize {
    let sec = sector_size as usize;
    if sec == 0 {
        return byte_len;
    }
    byte_len.div_ceil(sec) * sec
}

/// Pure NIST / Library of Congress `.sha256` sidecar line formatter (`<hex>  <filename>\n`).
#[must_use]
pub fn format_nist_sha256_sidecar(sha256_hex: &str, image_filename: &str) -> String {
    let clean_name = image_filename
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(image_filename);
    format!("{}  {}\n", sha256_hex.trim().to_ascii_lowercase(), clean_name)
}

/// Pure calculation of instantaneous or moving-average throughput (MB/s) and ETA (seconds).
#[must_use]
pub fn compute_imaging_progress(
    processed_bytes: u64,
    total_bytes: u64,
    elapsed_secs: f64,
) -> (f64, f64, u64) {
    let pct = if total_bytes > 0 {
        ((processed_bytes as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    if elapsed_secs <= 0.001 || processed_bytes == 0 {
        return (pct, 0.0, 0);
    }
    let mb_processed = processed_bytes as f64 / (1024.0 * 1024.0);
    let mbps = ((mb_processed / elapsed_secs) * 100.0).round() / 100.0;
    let remaining_bytes = total_bytes.saturating_sub(processed_bytes);
    let bytes_per_sec = processed_bytes as f64 / elapsed_secs;
    let eta = if bytes_per_sec > 1.0 {
        (remaining_bytes as f64 / bytes_per_sec).ceil() as u64
    } else {
        0
    };
    (pct, mbps, eta)
}

/// Coalesces adjacent single-sector failures into compact contiguous LBA ranges for `.dump_log.json`.
#[must_use]
pub fn coalesce_sector_errors(errors: &[SectorError]) -> Vec<SectorError> {
    let mut coalesced: Vec<SectorError> = Vec::new();
    for err in errors {
        if let Some(last) = coalesced.last_mut() {
            let contiguous_lba = last.start_lba + last.sector_count == err.start_lba;
            let same_kind = last.error_kind == err.error_kind && last.zero_padded == err.zero_padded;
            if contiguous_lba && same_kind {
                last.sector_count += err.sector_count;
                last.byte_length += err.byte_length;
                last.retries_attempted = last.retries_attempted.max(err.retries_attempted);
                continue;
            }
        }
        coalesced.push(err.clone());
    }
    coalesced
}

/// Maps an LBA offset to its corresponding visual bucket index `[0..bucket_count)`.
#[must_use]
pub fn map_lba_to_bucket(current_lba: u64, total_lba: u64, bucket_count: usize) -> usize {
    if total_lba == 0 || bucket_count == 0 {
        return 0;
    }
    let idx = ((current_lba as u128 * bucket_count as u128) / total_lba as u128) as usize;
    idx.min(bucket_count - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_sector_size() {
        assert_eq!(normalize_sector_size(512, false), 512);
        assert_eq!(normalize_sector_size(2048, false), 2048);
        assert_eq!(normalize_sector_size(4096, false), 4096);
        assert_eq!(normalize_sector_size(0, true), 2048);
        assert_eq!(normalize_sector_size(0, false), 512);
        assert_eq!(normalize_sector_size(1024, false), 1024);
        assert_eq!(normalize_sector_size(999, false), 512);
    }

    #[test]
    fn test_align_up_to_sector() {
        assert_eq!(align_up_to_sector(0, 512), 0);
        assert_eq!(align_up_to_sector(1, 512), 512);
        assert_eq!(align_up_to_sector(512, 512), 512);
        assert_eq!(align_up_to_sector(513, 512), 1024);
        assert_eq!(align_up_to_sector(1000, 2048), 2048);
        assert_eq!(align_up_to_sector(4097, 4096), 8192);
    }

    #[test]
    fn test_format_nist_sha256_sidecar() {
        let line = format_nist_sha256_sidecar(
            "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
            r"C:\dumps\tape_panasonic.img",
        );
        assert_eq!(
            line,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  tape_panasonic.img\n"
        );
    }

    #[test]
    fn test_compute_imaging_progress() {
        let (pct, speed, eta) = compute_imaging_progress(50 * 1024 * 1024, 100 * 1024 * 1024, 2.5);
        assert_eq!(pct, 50.0);
        assert_eq!(speed, 20.0);
        assert_eq!(eta, 3);

        let (pct0, speed0, eta0) = compute_imaging_progress(0, 100, 0.0);
        assert_eq!(pct0, 0.0);
        assert_eq!(speed0, 0.0);
        assert_eq!(eta0, 0);
    }

    #[test]
    fn test_coalesce_sector_errors() {
        let errors = vec![
            SectorError {
                start_lba: 100,
                sector_count: 1,
                byte_offset: 51200,
                byte_length: 512,
                error_kind: SectorErrorKind::CrcDataError,
                retries_attempted: 2,
                zero_padded: true,
            },
            SectorError {
                start_lba: 101,
                sector_count: 1,
                byte_offset: 51712,
                byte_length: 512,
                error_kind: SectorErrorKind::CrcDataError,
                retries_attempted: 3,
                zero_padded: true,
            },
            SectorError {
                start_lba: 105, // non-contiguous
                sector_count: 1,
                byte_offset: 53760,
                byte_length: 512,
                error_kind: SectorErrorKind::CrcDataError,
                retries_attempted: 2,
                zero_padded: true,
            },
        ];

        let coalesced = coalesce_sector_errors(&errors);
        assert_eq!(coalesced.len(), 2);
        assert_eq!(coalesced[0].start_lba, 100);
        assert_eq!(coalesced[0].sector_count, 2);
        assert_eq!(coalesced[0].byte_length, 1024);
        assert_eq!(coalesced[0].retries_attempted, 3);
        assert_eq!(coalesced[1].start_lba, 105);
        assert_eq!(coalesced[1].sector_count, 1);
    }

    #[test]
    fn test_map_lba_to_bucket() {
        assert_eq!(map_lba_to_bucket(0, 1000, 128), 0);
        assert_eq!(map_lba_to_bucket(500, 1000, 128), 64);
        assert_eq!(map_lba_to_bucket(1000, 1000, 128), 127);
    }
}
