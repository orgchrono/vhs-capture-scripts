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
    if !path.exists() {
        return Err(format!("Source path '{}' does not exist.", path.display()));
    }

    let metadata = path
        .metadata()
        .map_err(|e| format!("Failed to read metadata for '{}': {e}", path.display()))?;
    let file_size = metadata.len();

    let mut file = File::open(path)
        .map_err(|e| format!("Failed to open file '{}': {e}", path.display()))?;
    let mut probe_buf = vec![0u8; PANASONIC_PROBE_BUFFER_MAX_BYTES.min(file_size.max(1) as usize)];
    let _ = file.read_exact(&mut probe_buf);

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut inspection = classify_panasonic_probe(&probe_buf, file_size, &filename);

    // Deep seek fallback for raw HDD dumps whose partition superblocks are located at known offsets
    if !inspection.is_panasonic && file_size > PANASONIC_MEIHDFS_OFFSETS[0] {
        for &offset in &PANASONIC_MEIHDFS_OFFSETS {
            if offset < file_size && file.seek(SeekFrom::Start(offset)).is_ok() {
                let to_read = (PANASONIC_PROBE_BUFFER_MAX_BYTES as u64).min(file_size - offset) as usize;
                let mut deep_buf = vec![0u8; to_read];
                if file.read_exact(&mut deep_buf).is_ok() {
                    let deep_insp = classify_panasonic_probe(&deep_buf, file_size, &filename);
                    if deep_insp.is_panasonic {
                        let mut adjusted_offsets: Vec<usize> = deep_insp
                            .detected_offsets
                            .into_iter()
                            .map(|o| o + (offset as usize))
                            .collect();
                        if adjusted_offsets.is_empty() {
                            adjusted_offsets.push(offset as usize);
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

    Ok((inspection, file_size))
}
