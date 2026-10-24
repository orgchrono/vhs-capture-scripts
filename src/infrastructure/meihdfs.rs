//! Pure Functional Panasonic DVR (`MEIHDFS` / `DVD_RTAV`) Binary Header Inspector.
//!
//! Replaces external C binary shelling and regex parsing with memory-safe,
//! zero-copy slice inspection over raw disk/partition probe buffers.

use crate::models::constants::PANASONIC_FIRMWARE_UPDATE_SIZE_BYTES;
use serde::{Deserialize, Serialize};

pub const PANASONIC_FIRMWARE_SIZE_BYTES: u64 = PANASONIC_FIRMWARE_UPDATE_SIZE_BYTES;
pub const MEIHDFS_MAGIC: &[u8] = b"MEIHDFS";
pub const DVD_RTAV_MAGIC: &[u8] = b"DVD_RTAV";
pub const DVD_VR_IFO_MAGIC: &[u8] = b"DVD_RTR_VMG";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PanasonicFormatKind {
    MeihdfsProprietaryHdd,
    DvdRtavUdf,
    FirmwareUpdateImage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PanasonicMediaDescriptor {
    pub format_kind: PanasonicFormatKind,
    pub signature_offset: Option<usize>,
    pub total_size_bytes: u64,
    pub estimated_titles: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum IngestProbeError {
    EmptyBuffer,
    UnrecognizedFilesystem,
}

/// Pure zero-copy binary scanner that locates a subslice signature within `haystack`.
#[must_use]
pub fn find_signature_offset(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Pure function inspecting a header probe buffer and total media byte length
/// to classify Panasonic DVR HDD images (`MEIHDFS`), `DVD_RTAV` volumes, or `.FRM` images.
pub fn inspect_panasonic_probe(
    probe_bytes: &[u8],
    total_size_bytes: u64,
    has_frm_extension: bool,
) -> Result<PanasonicMediaDescriptor, IngestProbeError> {
    if probe_bytes.is_empty() {
        return Err(IngestProbeError::EmptyBuffer);
    }

    if let Some(offset) = find_signature_offset(probe_bytes, MEIHDFS_MAGIC) {
        let estimated_titles = count_program_markers(probe_bytes).max(1);
        return Ok(PanasonicMediaDescriptor {
            format_kind: PanasonicFormatKind::MeihdfsProprietaryHdd,
            signature_offset: Some(offset),
            total_size_bytes,
            estimated_titles,
        });
    }

    if let Some(offset) = find_signature_offset(probe_bytes, DVD_VR_IFO_MAGIC)
        .or_else(|| find_signature_offset(probe_bytes, DVD_RTAV_MAGIC))
    {
        let estimated_titles = count_program_markers(probe_bytes).max(1);
        return Ok(PanasonicMediaDescriptor {
            format_kind: PanasonicFormatKind::DvdRtavUdf,
            signature_offset: Some(offset),
            total_size_bytes,
            estimated_titles,
        });
    }

    if has_frm_extension && total_size_bytes == PANASONIC_FIRMWARE_SIZE_BYTES {
        return Ok(PanasonicMediaDescriptor {
            format_kind: PanasonicFormatKind::FirmwareUpdateImage,
            signature_offset: None,
            total_size_bytes,
            estimated_titles: 0,
        });
    }

    Err(IngestProbeError::UnrecognizedFilesystem)
}

#[must_use]
fn count_program_markers(probe_bytes: &[u8]) -> u32 {
    probe_bytes
        .windows(4)
        .filter(|w| *w == b"PROG" || *w == b"VOB\0")
        .count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_meihdfs_superblock() {
        let mut sector = vec![0_u8; 512];
        sector[64..71].copy_from_slice(b"MEIHDFS");
        sector[128..132].copy_from_slice(b"PROG");
        sector[192..196].copy_from_slice(b"PROG");

        let desc = inspect_panasonic_probe(&sector, 160_000_000_000, false)
            .expect("should detect MEIHDFS");
        assert_eq!(desc.format_kind, PanasonicFormatKind::MeihdfsProprietaryHdd);
        assert_eq!(desc.signature_offset, Some(64));
        assert_eq!(desc.estimated_titles, 2);
    }

    #[test]
    fn detects_dvd_rtav_ifo_header() {
        let mut sector = vec![0_u8; 256];
        sector[0..11].copy_from_slice(b"DVD_RTR_VMG");
        let desc = inspect_panasonic_probe(&sector, 4_700_000_000, false)
            .expect("should detect DVD_RTAV");
        assert_eq!(desc.format_kind, PanasonicFormatKind::DvdRtavUdf);
        assert_eq!(desc.signature_offset, Some(0));
    }

    #[test]
    fn rejects_unknown_binary_payload() {
        let random_sector = vec![0xAA_u8; 512];
        let res = inspect_panasonic_probe(&random_sector, 1024, false);
        assert_eq!(res, Err(IngestProbeError::UnrecognizedFilesystem));
    }
}
