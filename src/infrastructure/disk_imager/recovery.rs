//! Adaptive Sector-Level Fault Recovery & Bad-Sector Fallback (`disk_imager/recovery.rs`).

use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use sha2::{Digest, Sha256};
use super::{aligned_buffer::SectorAlignedBuffer, RawBlockReader};
use crate::domain::disk_imager::{
    map_lba_to_bucket, SectorBucketHealth, SectorError, SectorErrorKind,
};
use crate::models::constants::DISK_IMAGER_SECTOR_MAP_BUCKETS;

pub struct RecoveryContext<'a, W: Write> {
    pub reader: &'a mut Box<dyn RawBlockReader>,
    pub writer: &'a mut W,
    pub hasher: &'a mut Sha256,
    pub buffer: &'a mut SectorAlignedBuffer,
    pub cancel_flag: &'a AtomicBool,
    pub sector_map_buckets: &'a mut [SectorBucketHealth],
    pub sector_errors: &'a mut Vec<SectorError>,
    pub retried_sectors: &'a mut u64,
    pub bad_sectors: &'a mut u64,
    pub zero_filled_bytes: &'a mut u64,
}

pub struct RecoveryWindowConfig<'a> {
    pub current_offset: u64,
    pub failing_window_bytes: usize,
    pub sector_size: u32,
    pub total_lba: u64,
    pub max_sector_retries: u8,
    pub zero_fill_corrupt_sectors: bool,
    pub initial_err: &'a std::io::Error,
}

pub fn recover_failing_chunk_window<W: Write>(
    ctx: RecoveryContext<'_, W>,
    cfg: RecoveryWindowConfig<'_>,
) -> Result<(), String> {
    let mut window_offset = 0usize;

    while window_offset < cfg.failing_window_bytes {
        if ctx.cancel_flag.load(Ordering::SeqCst) {
            return Err("Imaging operation cancelled by user".to_string());
        }

        let sector_abs_offset = cfg.current_offset + window_offset as u64;
        let current_sector_lba = if cfg.sector_size > 0 {
            sector_abs_offset / (cfg.sector_size as u64)
        } else {
            0
        };
        let mut sector_read_success = false;
        let mut retries = 0u8;

        while retries <= cfg.max_sector_retries {
            match ctx.reader.read_aligned_at(
                sector_abs_offset,
                ctx.buffer.as_mut_slice(),
            ) {
                Ok(sn) if sn >= cfg.sector_size as usize => {
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
            cfg.total_lba,
            DISK_IMAGER_SECTOR_MAP_BUCKETS,
        );

        if sector_read_success {
            if retries > 0 {
                *ctx.retried_sectors += 1;
                ctx.sector_map_buckets[bucket_idx] = SectorBucketHealth::RetriedRecovered;
            } else if ctx.sector_map_buckets[bucket_idx] == SectorBucketHealth::Pending {
                ctx.sector_map_buckets[bucket_idx] = SectorBucketHealth::VerifiedGood;
            }

            let slice = &ctx.buffer.as_slice()[..cfg.sector_size as usize];
            if let Err(e) = ctx.writer.write_all(slice) {
                return Err(format!("Disk write error during recovery: {e}"));
            }
            ctx.hasher.update(slice);
        } else if cfg.zero_fill_corrupt_sectors {
            // Fault Tolerance: conv=noerror,sync zero-fill
            *ctx.bad_sectors += 1;
            *ctx.zero_filled_bytes += cfg.sector_size as u64;
            ctx.sector_map_buckets[bucket_idx] = SectorBucketHealth::ZeroFilledDamaged;

            let error_kind = match cfg.initial_err.raw_os_error() {
                Some(23) => SectorErrorKind::CrcDataError,
                Some(27) => SectorErrorKind::SectorNotFound,
                Some(1117) => SectorErrorKind::DeviceIoTimeout,
                Some(5) => SectorErrorKind::PermissionDenied,
                Some(other) => SectorErrorKind::UnknownOsError(other),
                None => SectorErrorKind::CrcDataError,
            };

            ctx.sector_errors.push(SectorError {
                start_lba: current_sector_lba,
                sector_count: 1,
                byte_offset: sector_abs_offset,
                byte_length: cfg.sector_size as u64,
                error_kind,
                retries_attempted: retries,
                zero_padded: true,
            });

            ctx.buffer.as_mut_slice().fill(0x00);
            let slice = &ctx.buffer.as_slice()[..cfg.sector_size as usize];
            if let Err(e) = ctx.writer.write_all(slice) {
                return Err(format!("Disk write error during zero-padding: {e}"));
            }
            ctx.hasher.update(slice);
        } else {
            return Err(format!(
                "Unrecoverable bad sector at LBA {current_sector_lba}: {}",
                cfg.initial_err
            ));
        }

        window_offset += cfg.sector_size as usize;
    }

    Ok(())
}
