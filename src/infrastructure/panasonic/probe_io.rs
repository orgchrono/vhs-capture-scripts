//! Low-level sector probe and deep-seek filesystem inspection for Panasonic DVR media.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use crate::domain::panasonic_format::{
    classify_panasonic_probe, PanasonicInspection, PANASONIC_MEIHDFS_OFFSETS,
    PANASONIC_PROBE_BUFFER_MAX_BYTES,
};

/// Inspect a file or disk image on host, including deep-seek offset scans
/// for MEIHDFS partition superblocks at standard Panasonic offsets (0x0160_0000, 0x1600_0000, 0xA400_0000).
pub fn inspect_panasonic_file(path: &Path) -> Result<(PanasonicInspection, u64), String> {
    let path_str = path.to_string_lossy();
    let is_raw_device = path_str.starts_with(r"\\.\") || path_str.starts_with("/dev/");
    if !is_raw_device && !path.exists() {
        return Err(format!("Source path '{}' does not exist.", path.display()));
    }

    let file_size = if is_raw_device {
        path.metadata().map(|m| m.len()).unwrap_or(0)
    } else {
        path
            .metadata()
            .map_err(|e| format!("Failed to read metadata for '{}': {e}", path.display()))?
            .len()
    };

    let mut file = File::open(path).map_err(|e| {
        if e.raw_os_error() == Some(5) {
            format!(
                "Access denied opening device '{}'. Administrator privileges required (OS error 5).",
                path.display()
            )
        } else {
            format!("Failed to open file '{}': {e}", path.display())
        }
    })?;

    let buf_len = if is_raw_device || file_size == 0 {
        PANASONIC_PROBE_BUFFER_MAX_BYTES
    } else {
        PANASONIC_PROBE_BUFFER_MAX_BYTES.min(file_size.max(1) as usize)
    };
    let mut probe_buf = vec![0u8; buf_len];
    let bytes_read = file.read(&mut probe_buf).unwrap_or(0);
    probe_buf.truncate(bytes_read);

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut inspection = classify_panasonic_probe(&probe_buf, file_size, &filename);

    // Deep seek fallback for raw HDD dumps whose partition superblocks are located at known offsets
    if !inspection.is_panasonic && (is_raw_device || file_size > PANASONIC_MEIHDFS_OFFSETS[0]) {
        for &offset in &PANASONIC_MEIHDFS_OFFSETS {
            if (is_raw_device || offset < file_size) && file.seek(SeekFrom::Start(offset)).is_ok() {
                let to_read = if is_raw_device || file_size == 0 {
                    PANASONIC_PROBE_BUFFER_MAX_BYTES
                } else {
                    (PANASONIC_PROBE_BUFFER_MAX_BYTES as u64).min(file_size.saturating_sub(offset)) as usize
                };
                let mut deep_buf = vec![0u8; to_read];
                if let Ok(n) = file.read(&mut deep_buf) {
                    deep_buf.truncate(n);
                    if !deep_buf.is_empty() {
                        let deep_insp = classify_panasonic_probe(&deep_buf, file_size, &filename);
                        if deep_insp.is_panasonic {
                            let offset_usize = usize::try_from(offset).unwrap_or(usize::MAX);
                            let mut adjusted_offsets: Vec<usize> = deep_insp
                                .detected_offsets
                                .into_iter()
                                .map(|o| o.saturating_add(offset_usize))
                                .collect();
                            if adjusted_offsets.is_empty() {
                                adjusted_offsets.push(offset_usize);
                            }
                            inspection = PanasonicInspection {
                                detected_offsets: adjusted_offsets,
                                ..deep_insp
                            };
                            break;
                        }
                    }
                }
            }
        }
    }

    Ok((inspection, file_size))
}
