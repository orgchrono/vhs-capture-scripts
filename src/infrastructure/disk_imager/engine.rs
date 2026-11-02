//! Raw Block Device Imaging Engine (`infrastructure::disk_imager::engine`).
//!
//! Orchestrates direct I/O streaming, sector-granularity error recovery,
//! in-flight SHA-256 fixity computation, 4 Hz telemetry, and forensic sidecars.

use super::{
    aligned_buffer::SectorAlignedBuffer,
    manifest::{
        build_and_write_dump_report, promote_part_to_final_image, write_sha256_sidecar,
        DumpReportParams,
    },
    open_block_device,
    recovery::{recover_failing_chunk_window, RecoveryContext, RecoveryWindowConfig},
    telemetry::emit_imaging_telemetry,
    RawBlockReader,
};
use crate::domain::disk_imager::{
    align_up_to_sector, compute_imaging_progress, map_lba_to_bucket, normalize_sector_size,
    ForensicDumpReport, ImagingConfig, ImagingPhase, ImagingTelemetry, SectorBucketHealth,
    SectorError,
};
use crate::infrastructure::app_context::AppContext;
use crate::models::constants::DISK_IMAGER_SECTOR_MAP_BUCKETS;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::atomic::Ordering;
use std::time::Instant;

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
        .map_err(|e| format!("Failed to create intermediate part file '{part_path}': {e}"))?;
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
    emit_imaging_telemetry(ctx, window, &current_telemetry);

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
                // Adaptive Bad-Sector Fallback: switch to single sector recovery across chunk window
                let failing_window_bytes = aligned_req_len;
                let rec_ctx = RecoveryContext {
                    reader: &mut reader,
                    writer: &mut writer,
                    hasher: &mut hasher,
                    buffer: &mut single_sector_buffer,
                    cancel_flag: &ctx.process.cancel_flag(),
                    sector_map_buckets: &mut sector_map_buckets,
                    sector_errors: &mut sector_errors,
                    retried_sectors: &mut retried_sectors,
                    bad_sectors: &mut bad_sectors,
                    zero_filled_bytes: &mut zero_filled_bytes,
                };

                let rec_cfg = RecoveryWindowConfig {
                    current_offset,
                    failing_window_bytes,
                    sector_size,
                    total_lba,
                    max_sector_retries: config.max_sector_retries,
                    zero_fill_corrupt_sectors: config.zero_fill_corrupt_sectors,
                    initial_err: &initial_err,
                };

                if let Err(err_msg) = recover_failing_chunk_window(rec_ctx, rec_cfg) {
                    cleanup_part(part_target);
                    ctx.process.set_result(false, Some(1));
                    return Err(err_msg);
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
                current_lba: if sector_size > 0 {
                    current_offset / (sector_size as u64)
                } else {
                    0
                },
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
            emit_imaging_telemetry(ctx, window, &current_telemetry);
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
    if let Err(e) = promote_part_to_final_image(part_target, output_target) {
        cleanup_part(part_target);
        ctx.process.set_result(false, Some(1));
        return Err(e);
    }

    // Sidecars
    if config.compute_sha256_sidecar {
        write_sha256_sidecar(&config.output_image_path, &sha256_hex);
    }

    let elapsed_total = start_time.elapsed().as_secs_f64();
    let avg_speed = if elapsed_total > 0.0 {
        ((processed_bytes as f64 / (1024.0 * 1024.0)) / elapsed_total * 100.0).round() / 100.0
    } else {
        0.0
    };

    let dump_report = build_and_write_dump_report(DumpReportParams {
        source_device_id: &config.source_device_id,
        output_image_path: &config.output_image_path,
        sha256_hex: &sha256_hex,
        dev_total_bytes,
        processed_bytes,
        sector_size,
        bad_sectors,
        zero_filled_bytes,
        peak_speed_mbps,
        elapsed_total,
        sector_errors: &sector_errors,
    });

    // Final completed telemetry
    current_telemetry.phase = ImagingPhase::Completed;
    current_telemetry.progress_percent = 100.0;
    current_telemetry.throughput_mbps = avg_speed;
    current_telemetry.eta_seconds = 0;
    current_telemetry.sha256_hex = Some(sha256_hex);
    current_telemetry.sector_map_buckets = sector_map_buckets;
    emit_imaging_telemetry(ctx, window, &current_telemetry);

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
        read_counts: AtomicU32,
    }

    impl RawBlockReader for MockBadSectorReader {
        fn read_aligned_at(&mut self, byte_offset: u64, buf: &mut [u8]) -> Result<usize, std::io::Error> {
            self.read_counts.fetch_add(1, Ordering::SeqCst);
            let lba = byte_offset / self.sector_size as u64;

            if self.bad_lbas.contains(&lba) {
                return Err(std::io::Error::from_raw_os_error(23)); // ERROR_CRC
            }

            let start = byte_offset as usize;
            if start >= self.data.len() {
                return Ok(0);
            }
            let end = (start + buf.len()).min(self.data.len());
            let n = end - start;
            buf[..n].copy_from_slice(&self.data[start..end]);
            Ok(n)
        }

        fn device_geometry(&self) -> (u64, u32) {
            (self.data.len() as u64, self.sector_size)
        }

        fn device_id(&self) -> &str {
            "MOCK_DEVICE_BAD_SECTORS"
        }
    }

    #[test]
    fn test_disk_imaging_bad_sector_recovery_and_zero_fill() {
        let sector_size = 512u32;
        let total_sectors = 16usize;
        let mut mock_data = vec![0xABu8; total_sectors * sector_size as usize];
        // Populate recognizable pattern
        for (i, byte) in mock_data.iter_mut().enumerate() {
            *byte = (i % 256) as u8;
        }

        let bad_lba = 4u64;
        let mock_reader = Box::new(MockBadSectorReader {
            data: mock_data.clone(),
            sector_size,
            bad_lbas: vec![bad_lba],
            read_counts: AtomicU32::new(0),
        });

        let temp_dir = std::env::temp_dir().join(format!("vhs_imager_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let output_img = temp_dir.join("dump_test.img");
        let output_img_str = output_img.to_string_lossy().to_string();

        let ctx = AppContext::new_test(&temp_dir);
        let config = ImagingConfig {
            source_device_id: "MOCK_BAD_SECTOR_DEV".to_string(),
            output_image_path: output_img_str.clone(),
            container_format: crate::domain::disk_imager::ImageContainerFormat::Img,
            physical_sector_bytes: sector_size,
            primary_chunk_bytes: 2048, // 4 sectors per chunk
            max_sector_retries: 2,
            zero_fill_corrupt_sectors: true,
            compute_sha256_sidecar: true,
            auto_chain_restoration: false,
            auto_enqueue_preset: None,
        };

        let report = run_disk_imaging_job(&ctx, &config, None, Some(mock_reader))
            .expect("Imaging job should succeed with zero-padding");

        assert_eq!(report.damaged_sector_count, 1);
        assert_eq!(report.zero_filled_bytes, sector_size as u64);
        assert_eq!(report.damaged_lba_ranges.len(), 1);
        assert_eq!(report.damaged_lba_ranges[0].start_lba, bad_lba);

        // Verify output file size and zero-filled sector
        assert!(output_img.exists());
        let dumped_bytes = std::fs::read(&output_img).expect("Failed to read dumped image");
        assert_eq!(dumped_bytes.len(), mock_data.len());

        // Verify that sector 4 is completely zeroed out
        let bad_sector_start = (bad_lba * sector_size as u64) as usize;
        let bad_sector_slice = &dumped_bytes[bad_sector_start..bad_sector_start + sector_size as usize];
        assert!(bad_sector_slice.iter().all(|&b| b == 0x00));

        // Verify that sector 3 retains original pattern
        let good_sector_start = 3 * sector_size as usize;
        let good_sector_slice = &dumped_bytes[good_sector_start..good_sector_start + sector_size as usize];
        assert_eq!(good_sector_slice, &mock_data[good_sector_start..good_sector_start + sector_size as usize]);

        // Verify sidecars
        let sha_path = format!("{output_img_str}.sha256");
        assert!(std::path::Path::new(&sha_path).exists());
        let dump_log_path = format!("{output_img_str}.dump_log.json");
        assert!(std::path::Path::new(&dump_log_path).exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
