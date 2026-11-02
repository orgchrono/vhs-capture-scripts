//! Raw Block Device Imaging Engine (`infrastructure::disk_imager::engine`).
//!
//! Orchestrates direct I/O streaming, sector-granularity error recovery,
//! in-flight SHA-256 fixity computation, 4 Hz telemetry, and forensic sidecars.

use super::{aligned_buffer::SectorAlignedBuffer, open_block_device, RawBlockReader};
use crate::domain::disk_imager::{
    align_up_to_sector, coalesce_sector_errors, compute_imaging_progress,
    format_nist_sha256_sidecar, map_lba_to_bucket, normalize_sector_size, ForensicDumpReport,
    ImagingConfig, ImagingPhase, ImagingTelemetry, SectorBucketHealth, SectorError,
    SectorErrorKind,
};
use crate::infrastructure::app_context::AppContext;
use crate::models::constants::{
    DISK_IMAGER_SECTOR_MAP_BUCKETS, DISK_IMAGING_SSE_PREFIX, DUMP_LOG_SIDECAR_SUFFIX,
    SHA256_SIDECAR_SUFFIX,
};
use sha2::{Digest, Sha256};
use tauri::Emitter;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::Instant;

fn emit_telemetry(
    ctx: &AppContext,
    window: Option<&tauri::Window>,
    telemetry: &ImagingTelemetry,
) {
    if let Ok(json_str) = serde_json::to_string(telemetry) {
        ctx.process
            .append_log(format!("{DISK_IMAGING_SSE_PREFIX}{json_str}"));
    }
    if let Some(win) = window {
        let _ = win.emit("disk_imaging_progress", telemetry);
    }
}

/// Executes a raw block device imaging operation.
pub fn run_disk_imaging_job(
    ctx: &AppContext,
    config: &ImagingConfig,
    window: Option<&tauri::Window>,
    reader_override: Option<Box<dyn RawBlockReader>>,
) -> Result<ForensicDumpReport, String> {
    let start_time = Instant::now();
    ctx.process.set_in_process_active(true);

    let output_target = Path::new(&config.output_image_path);
    if let Some(parent) = output_target.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }

    let part_path = format!("{}.part", config.output_image_path);
    let part_target = Path::new(&part_path);

    // 1. Open direct block reader
    let mut reader = match reader_override {
        Some(r) => r,
        None => open_block_device(&config.source_device_id, config.physical_sector_bytes)
            .map_err(|e| format!("Failed to open block device '{}': {e}", config.source_device_id))?,
    };

    let (dev_total_bytes, reported_sector_size) = reader.device_geometry();
    let sector_size = normalize_sector_size(
        if config.physical_sector_bytes > 0 {
            config.physical_sector_bytes
        } else {
            reported_sector_size
        },
        false,
    );

    let primary_chunk_size = align_up_to_sector(
        config.primary_chunk_bytes.max(sector_size as usize),
        sector_size,
    );

    let mut primary_buffer = SectorAlignedBuffer::new(primary_chunk_size);
    let mut single_sector_buffer = SectorAlignedBuffer::new(sector_size as usize);

    // Open target file
    let part_file = File::create(part_target)
        .map_err(|e| format!("Failed to create intermediate part file '{}': {e}", part_path))?;
    let mut writer = BufWriter::with_capacity(primary_chunk_size, part_file);

    let mut hasher = Sha256::new();
    let total_lba = if sector_size > 0 {
        dev_total_bytes / (sector_size as u64)
    } else {
        0
    };

    let mut current_offset = 0u64;
    let mut processed_bytes = 0u64;
    let mut retried_sectors = 0u64;
    let mut bad_sectors = 0u64;
    let mut zero_filled_bytes = 0u64;
    let mut sector_errors: Vec<SectorError> = Vec::new();

    let mut sector_map_buckets = vec![SectorBucketHealth::Pending; DISK_IMAGER_SECTOR_MAP_BUCKETS];
    let mut last_telemetry_emit = Instant::now();
    let mut peak_speed_mbps = 0.0f64;

    let cleanup_part = |target: &Path| {
        let _ = std::fs::remove_file(target);
    };

    // Telemetry Phase: StreamingBlocks
    let mut current_telemetry = ImagingTelemetry {
        phase: ImagingPhase::StreamingBlocks,
        source_device_id: config.source_device_id.clone(),
        output_image_path: config.output_image_path.clone(),
        current_lba: 0,
        total_lba,
        processed_bytes: 0,
        total_bytes: dev_total_bytes,
        progress_percent: 0.0,
        throughput_mbps: 0.0,
        eta_seconds: 0,
        retried_sector_count: 0,
        bad_sector_count: 0,
        zero_filled_bytes: 0,
        sector_map_buckets: sector_map_buckets.clone(),
        sha256_hex: None,
    };
    emit_telemetry(ctx, window, &current_telemetry);

    while dev_total_bytes == 0 || current_offset < dev_total_bytes {
        if ctx.process.cancel_flag().load(Ordering::SeqCst) {
            cleanup_part(part_target);
            ctx.process.set_result(false, Some(1));
            return Err("Imaging operation cancelled by user".to_string());
        }

        let chunk_len = if dev_total_bytes > 0 {
            let rem = dev_total_bytes.saturating_sub(current_offset);
            (primary_chunk_size as u64).min(rem) as usize
        } else {
            primary_chunk_size
        };

        if chunk_len == 0 {
            break;
        }

        let aligned_req_len = align_up_to_sector(chunk_len, sector_size);
        let read_result = reader.read_aligned_at(
            current_offset,
            &mut primary_buffer.as_mut_slice()[..aligned_req_len],
        );

        match read_result {
            Ok(0) => {
                // End of device reached
                break;
            }
            Ok(n) => {
                let bytes_to_commit = n.min(chunk_len);
                let slice = &primary_buffer.as_slice()[..bytes_to_commit];
                if let Err(e) = writer.write_all(slice) {
                    cleanup_part(part_target);
                    ctx.process.set_result(false, Some(1));
                    return Err(format!("Disk write error: {e}"));
                }
                hasher.update(slice);

                let start_lba = current_offset / (sector_size as u64);
                let end_lba = (current_offset + bytes_to_commit as u64) / (sector_size as u64);
                for lba in start_lba..end_lba {
                    let b_idx = map_lba_to_bucket(lba, total_lba, DISK_IMAGER_SECTOR_MAP_BUCKETS);
                    if sector_map_buckets[b_idx] == SectorBucketHealth::Pending {
                        sector_map_buckets[b_idx] = SectorBucketHealth::VerifiedGood;
                    }
                }

                current_offset += bytes_to_commit as u64;
                processed_bytes += bytes_to_commit as u64;
            }
            Err(initial_err) => {
                // Adaptive Bad-Sector Fallback: switch to single sector reads across chunk window
                let failing_window_bytes = aligned_req_len;
                let mut window_offset = 0usize;

                while window_offset < failing_window_bytes {
                    if ctx.process.cancel_flag().load(Ordering::SeqCst) {
                        cleanup_part(part_target);
                        ctx.process.set_result(false, Some(1));
                        return Err("Imaging operation cancelled by user".to_string());
                    }

                    let sector_abs_offset = current_offset + window_offset as u64;
                    let current_sector_lba = sector_abs_offset / (sector_size as u64);
                    let mut sector_read_success = false;
                    let mut retries = 0u8;

                    while retries <= config.max_sector_retries {
                        match reader.read_aligned_at(
                            sector_abs_offset,
                            single_sector_buffer.as_mut_slice(),
                        ) {
                            Ok(sn) if sn >= sector_size as usize => {
                                sector_read_success = true;
                                break;
                            }
                            _ => {
                                retries += 1;
                            }
                        }
                    }

                    let bucket_idx = map_lba_to_bucket(
                        current_sector_lba,
                        total_lba,
                        DISK_IMAGER_SECTOR_MAP_BUCKETS,
                    );

                    if sector_read_success {
                        if retries > 0 {
                            retried_sectors += 1;
                            sector_map_buckets[bucket_idx] = SectorBucketHealth::RetriedRecovered;
                        } else if sector_map_buckets[bucket_idx] == SectorBucketHealth::Pending {
                            sector_map_buckets[bucket_idx] = SectorBucketHealth::VerifiedGood;
                        }

                        let slice = &single_sector_buffer.as_slice()[..sector_size as usize];
                        if let Err(e) = writer.write_all(slice) {
                            cleanup_part(part_target);
                            ctx.process.set_result(false, Some(1));
                            return Err(format!("Disk write error during recovery: {e}"));
                        }
                        hasher.update(slice);
                    } else if config.zero_fill_corrupt_sectors {
                        // Fault Tolerance: conv=noerror,sync zero-fill
                        bad_sectors += 1;
                        zero_filled_bytes += sector_size as u64;
                        sector_map_buckets[bucket_idx] = SectorBucketHealth::ZeroFilledDamaged;

                        let error_kind = match initial_err.raw_os_error() {
                            Some(23) => SectorErrorKind::CrcDataError,
                            Some(27) => SectorErrorKind::SectorNotFound,
                            Some(1117) => SectorErrorKind::DeviceIoTimeout,
                            Some(5) => SectorErrorKind::PermissionDenied,
                            Some(other) => SectorErrorKind::UnknownOsError(other),
                            None => SectorErrorKind::CrcDataError,
                        };

                        sector_errors.push(SectorError {
                            start_lba: current_sector_lba,
                            sector_count: 1,
                            byte_offset: sector_abs_offset,
                            byte_length: sector_size as u64,
                            error_kind,
                            retries_attempted: retries,
                            zero_padded: true,
                        });

                        single_sector_buffer.as_mut_slice().fill(0x00);
                        let slice = &single_sector_buffer.as_slice()[..sector_size as usize];
                        if let Err(e) = writer.write_all(slice) {
                            cleanup_part(part_target);
                            ctx.process.set_result(false, Some(1));
                            return Err(format!("Disk write error during zero-padding: {e}"));
                        }
                        hasher.update(slice);
                    } else {
                        cleanup_part(part_target);
                        ctx.process.set_result(false, Some(1));
                        return Err(format!(
                            "Unrecoverable bad sector at LBA {current_sector_lba}: {initial_err}"
                        ));
                    }

                    window_offset += sector_size as usize;
                }

                current_offset += failing_window_bytes as u64;
                processed_bytes += failing_window_bytes as u64;
            }
        }

        // 4 Hz Telemetry Broadcast
        if last_telemetry_emit.elapsed().as_millis() >= 250 {
            let elapsed_s = start_time.elapsed().as_secs_f64();
            let (pct, speed, eta) =
                compute_imaging_progress(processed_bytes, dev_total_bytes, elapsed_s);
            if speed > peak_speed_mbps {
                peak_speed_mbps = speed;
            }

            current_telemetry = ImagingTelemetry {
                phase: ImagingPhase::StreamingBlocks,
                source_device_id: config.source_device_id.clone(),
                output_image_path: config.output_image_path.clone(),
                current_lba: current_offset / (sector_size as u64),
                total_lba,
                processed_bytes,
                total_bytes: dev_total_bytes,
                progress_percent: pct,
                throughput_mbps: speed,
                eta_seconds: eta,
                retried_sector_count: retried_sectors,
                bad_sector_count: bad_sectors,
                zero_filled_bytes,
                sector_map_buckets: sector_map_buckets.clone(),
                sha256_hex: None,
            };
            emit_telemetry(ctx, window, &current_telemetry);
            last_telemetry_emit = Instant::now();
        }
    }

    if let Err(e) = writer.flush() {
        cleanup_part(part_target);
        ctx.process.set_result(false, Some(1));
        return Err(format!("Failed to flush part file buffer: {e}"));
    }
    drop(writer);

    // Compute final digest
    let sha256_result = hasher.finalize();
    let sha256_hex: String = sha256_result
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    // Atomic file promotion
    if output_target.exists() {
        let _ = std::fs::remove_file(output_target);
    }
    if let Err(e) = std::fs::rename(part_target, output_target) {
        cleanup_part(part_target);
        ctx.process.set_result(false, Some(1));
        return Err(format!("Failed to promote disk image file: {e}"));
    }

    // Sidecars
    if config.compute_sha256_sidecar {
        let sha256_sidecar_path = format!("{}{}", config.output_image_path, SHA256_SIDECAR_SUFFIX);
        let content = format_nist_sha256_sidecar(&sha256_hex, &config.output_image_path);
        let _ = std::fs::write(&sha256_sidecar_path, content);
    }

    let elapsed_total = start_time.elapsed().as_secs_f64();
    let avg_speed = if elapsed_total > 0.0 {
        ((processed_bytes as f64 / (1024.0 * 1024.0)) / elapsed_total * 100.0).round() / 100.0
    } else {
        0.0
    };

    let coalesced_errors = coalesce_sector_errors(&sector_errors);
    let dump_report = ForensicDumpReport {
        schema_version: 1,
        source_device_id: config.source_device_id.clone(),
        device_model: "Direct Block Device".to_string(),
        device_serial: "FORENSIC-RAW-INGEST".to_string(),
        output_image_path: config.output_image_path.clone(),
        sha256_hex: sha256_hex.clone(),
        total_bytes_expected: dev_total_bytes,
        total_bytes_written: processed_bytes,
        sector_size_bytes: sector_size,
        total_sectors_read: processed_bytes / (sector_size as u64),
        damaged_sector_count: bad_sectors,
        zero_filled_bytes,
        average_speed_mbps: avg_speed,
        peak_speed_mbps,
        elapsed_seconds: (elapsed_total * 100.0).round() / 100.0,
        damaged_lba_ranges: coalesced_errors,
    };

    let log_path = format!("{}{}", config.output_image_path, DUMP_LOG_SIDECAR_SUFFIX);
    if let Ok(dump_json) = serde_json::to_string_pretty(&dump_report) {
        let _ = std::fs::write(&log_path, dump_json);
    }

    // Final completed telemetry
    current_telemetry.phase = ImagingPhase::Completed;
    current_telemetry.progress_percent = 100.0;
    current_telemetry.throughput_mbps = avg_speed;
    current_telemetry.eta_seconds = 0;
    current_telemetry.sha256_hex = Some(sha256_hex);
    current_telemetry.sector_map_buckets = sector_map_buckets;
    emit_telemetry(ctx, window, &current_telemetry);

    ctx.process.set_result(true, Some(0));
    Ok(dump_report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU32;

    struct MockBadSectorReader {
        data: Vec<u8>,
        sector_size: u32,
        bad_lbas: Vec<u64>,
        read_attempts: AtomicU32,
    }

    impl MockBadSectorReader {
        fn new(size_bytes: usize, sector_size: u32, bad_lbas: Vec<u64>) -> Self {
            let mut data = vec![0u8; size_bytes];
            for (i, b) in data.iter_mut().enumerate() {
                *b = (i % 251) as u8;
            }
            Self {
                data,
                sector_size,
                bad_lbas,
                read_attempts: AtomicU32::new(0),
            }
        }
    }

    impl RawBlockReader for MockBadSectorReader {
        fn read_aligned_at(&mut self, byte_offset: u64, buf: &mut [u8]) -> Result<usize, std::io::Error> {
            self.read_attempts.fetch_add(1, Ordering::SeqCst);
            let start_lba = byte_offset / (self.sector_size as u64);
            let sector_count = buf.len() / (self.sector_size as usize);

            // If reading more than 1 sector and any bad LBA is within the window, fail with CRC error
            for lba in start_lba..(start_lba + sector_count as u64) {
                if self.bad_lbas.contains(&lba) {
                    return Err(std::io::Error::from_raw_os_error(23)); // ERROR_CRC
                }
            }

            if byte_offset as usize >= self.data.len() {
                return Ok(0);
            }

            let available = self.data.len() - byte_offset as usize;
            let to_copy = buf.len().min(available);
            buf[..to_copy].copy_from_slice(&self.data[byte_offset as usize..byte_offset as usize + to_copy]);
            Ok(to_copy)
        }

        fn device_geometry(&self) -> (u64, u32) {
            (self.data.len() as u64, self.sector_size)
        }

        fn device_id(&self) -> &str {
            "MOCK_DEVICE_BAD_SECTOR"
        }
    }

    #[test]
    fn test_engine_recovers_bad_sectors_with_zero_padding() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_imager_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let ctx = AppContext::new_test(&temp_dir);

        let total_bytes = 64 * 1024; // 64 KiB
        let sector_size = 512;
        // Bad sector at LBA 10
        let bad_lbas = vec![10];
        let mock = Box::new(MockBadSectorReader::new(total_bytes, sector_size, bad_lbas));

        let out_img = temp_dir.join("test_dump.img");
        let config = ImagingConfig {
            source_device_id: "mock".to_string(),
            output_image_path: out_img.to_string_lossy().to_string(),
            container_format: crate::domain::disk_imager::ImageContainerFormat::Img,
            primary_chunk_bytes: 16 * 1024, // 16 KiB chunks
            physical_sector_bytes: sector_size,
            max_sector_retries: 1,
            zero_fill_corrupt_sectors: true,
            compute_sha256_sidecar: true,
            auto_chain_restoration: false,
            auto_enqueue_preset: None,
        };

        let report = run_disk_imaging_job(&ctx, &config, None, Some(mock))
            .expect("Engine should succeed with zero padding");

        assert_eq!(report.damaged_sector_count, 1);
        assert_eq!(report.zero_filled_bytes, 512);
        assert_eq!(report.total_bytes_written, 64 * 1024);

        // Check generated file size on disk
        let metadata = std::fs::metadata(&out_img).expect("Output image exists");
        assert_eq!(metadata.len(), 64 * 1024);

        // Check zero-padded slice at LBA 10 (bytes 5120..5632)
        let contents = std::fs::read(&out_img).expect("Read output image");
        let bad_slice = &contents[5120..5632];
        assert!(bad_slice.iter().all(|&b| b == 0x00));

        // Other slices should NOT be all zero
        let good_slice = &contents[0..512];
        assert!(!good_slice.iter().all(|&b| b == 0x00));

        // Check sidecars exist
        let sha_path = format!("{}{}", config.output_image_path, SHA256_SIDECAR_SUFFIX);
        let dump_log_path = format!("{}{}", config.output_image_path, DUMP_LOG_SIDECAR_SUFFIX);
        assert!(std::path::Path::new(&sha_path).exists());
        assert!(std::path::Path::new(&dump_log_path).exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
