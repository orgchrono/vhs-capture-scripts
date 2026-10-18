//! Pure Functional Panasonic DVR Ingestion, Partition Parsing, and Chapter Generator.
//!
//! Provides zero-copy signature scanning, filesystem classification (MEIHDFS-V1.0, MEIHDFS-V2.0,
//! DVD-VR, MPEG2-PS), drive hardware heuristics, and deterministic chapter marker generation.

use serde::{Deserialize, Serialize};

pub const PANASONIC_CHAPTER_INTERVAL_SEC: f64 = 900.0; // 15-minute standard chapters
pub const PANASONIC_DEFAULT_TITLE_DURATION_SEC: f64 = 3600.0;
pub const PANASONIC_FIRMWARE_SIZE_BYTES: u64 = 104_857_600; // 100MB DMR-EH55 service image

pub const SIG_MEIHDFS_V2: &[u8] = b"MEIHDFS-V2.0";
pub const SIG_MEIHDFS_V1: &[u8] = b"MEIHDFS-V1.0";
pub const SIG_MEIHDFS_GENERIC: &[u8] = b"MEIHDFS";
pub const SIG_DVD_VR_MANGR: &[u8] = b"VR_MANGR.IFO";
pub const SIG_DVD_VR_MOVIE: &[u8] = b"VR_MOVIE.VRO";
pub const SIG_DVD_RTAV: &[u8] = b"DVD_RTAV";
pub const MPEG2_PACK_HEADER: &[u8] = b"\x00\x00\x01\xba";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PanasonicFilesystemFormat {
    MeihdfsV2,
    MeihdfsV1,
    MeihdfsGeneric,
    DvdVr,
    Mpeg2PsStream,
    PanasonicFirmwareServiceImage,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PanasonicInspection {
    pub is_panasonic: bool,
    pub format: PanasonicFilesystemFormat,
    pub format_label: String,
    pub can_extract: bool,
    pub detected_offsets: Vec<usize>,
    pub estimated_titles: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PanasonicChapter {
    pub id: u32,
    pub title: String,
    pub start_sec: f64,
    pub start_timecode: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PanasonicDriveHeuristic {
    pub is_panasonic: bool,
    pub bus_type: String,
    pub is_usb: bool,
    pub is_jmicron_bridge: bool,
    pub is_asmedia_bridge: bool,
    pub probable_format: PanasonicFilesystemFormat,
}

/// Pure zero-copy signature scanner across binary probe buffers.
#[must_use]
pub fn locate_signature(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Pure zero-copy occurrence counter.
#[must_use]
pub fn count_occurrences(haystack: &[u8], needle: &[u8]) -> usize {
    if needle.is_empty() || haystack.len() < needle.len() {
        return 0;
    }
    haystack.windows(needle.len()).filter(|w| *w == needle).count()
}

/// Pure functional classifier for raw Panasonic header data and file attributes.
#[must_use]
pub fn classify_panasonic_probe(
    probe_bytes: &[u8],
    source_size_bytes: u64,
    filename_lower: &str,
) -> PanasonicInspection {
    if probe_bytes.is_empty() {
        return PanasonicInspection {
            is_panasonic: false,
            format: PanasonicFilesystemFormat::Unknown,
            format_label: "EMPTY_BUFFER".to_string(),
            can_extract: false,
            detected_offsets: vec![],
            estimated_titles: 0,
        };
    }

    // 0. Firmware service image detection
    let is_firmware_name = filename_lower.contains("firmware")
        && (filename_lower.contains("hdd") || filename_lower.contains("panasonic"));
    let is_firmware_size = source_size_bytes == PANASONIC_FIRMWARE_SIZE_BYTES;

    if (is_firmware_size || is_firmware_name)
        && locate_signature(probe_bytes, SIG_MEIHDFS_V2).is_none()
        && locate_signature(probe_bytes, SIG_MEIHDFS_V1).is_none()
        && count_occurrences(probe_bytes, MPEG2_PACK_HEADER) < 3
    {
        return PanasonicInspection {
            is_panasonic: true,
            format: PanasonicFilesystemFormat::PanasonicFirmwareServiceImage,
            format_label: "PANASONIC_FIRMWARE_SERVICE_IMAGE".to_string(),
            can_extract: false,
            detected_offsets: vec![],
            estimated_titles: 0,
        };
    }

    // 1. MEIHDFS-V2.0
    if let Some(offset) = locate_signature(probe_bytes, SIG_MEIHDFS_V2) {
        let count = count_occurrences(probe_bytes, SIG_MEIHDFS_V2).max(1);
        return PanasonicInspection {
            is_panasonic: true,
            format: PanasonicFilesystemFormat::MeihdfsV2,
            format_label: "MEIHDFS-V2.0".to_string(),
            can_extract: true,
            detected_offsets: vec![offset],
            estimated_titles: count,
        };
    }

    // 2. MEIHDFS-V1.0
    if let Some(offset) = locate_signature(probe_bytes, SIG_MEIHDFS_V1) {
        let count = count_occurrences(probe_bytes, SIG_MEIHDFS_V1).max(1);
        return PanasonicInspection {
            is_panasonic: true,
            format: PanasonicFilesystemFormat::MeihdfsV1,
            format_label: "MEIHDFS-V1.0".to_string(),
            can_extract: true,
            detected_offsets: vec![offset],
            estimated_titles: count,
        };
    }

    // 3. Generic MEIHDFS
    if let Some(offset) = locate_signature(probe_bytes, SIG_MEIHDFS_GENERIC) {
        return PanasonicInspection {
            is_panasonic: true,
            format: PanasonicFilesystemFormat::MeihdfsGeneric,
            format_label: "MEIHDFS".to_string(),
            can_extract: true,
            detected_offsets: vec![offset],
            estimated_titles: 1,
        };
    }

    // 4. DVD-VR / DVD_RTAV
    if let Some(offset) = locate_signature(probe_bytes, SIG_DVD_VR_MANGR)
        .or_else(|| locate_signature(probe_bytes, SIG_DVD_RTAV))
        .or_else(|| locate_signature(probe_bytes, SIG_DVD_VR_MOVIE))
    {
        return PanasonicInspection {
            is_panasonic: true,
            format: PanasonicFilesystemFormat::DvdVr,
            format_label: "DVD-VR".to_string(),
            can_extract: true,
            detected_offsets: vec![offset],
            estimated_titles: 1,
        };
    }

    // 5. MPEG-2 Program Stream
    let pack_count = count_occurrences(probe_bytes, MPEG2_PACK_HEADER);
    if pack_count >= 5 {
        let offset = locate_signature(probe_bytes, MPEG2_PACK_HEADER).unwrap_or(0);
        return PanasonicInspection {
            is_panasonic: true,
            format: PanasonicFilesystemFormat::Mpeg2PsStream,
            format_label: "MPEG2-PS-STREAM".to_string(),
            can_extract: true,
            detected_offsets: vec![offset],
            estimated_titles: 1,
        };
    }

    PanasonicInspection {
        is_panasonic: false,
        format: PanasonicFilesystemFormat::Unknown,
        format_label: "UNKNOWN".to_string(),
        can_extract: false,
        detected_offsets: vec![],
        estimated_titles: 0,
    }
}

/// Pure chapter marker generator formatting HH:MM:SS timestamps.
#[must_use]
pub fn generate_panasonic_chapters(
    duration_sec: f64,
    interval_sec: f64,
) -> Vec<PanasonicChapter> {
    if duration_sec <= 0.0 || interval_sec <= 0.0 {
        return vec![PanasonicChapter {
            id: 1,
            title: "Chapter 1".to_string(),
            start_sec: 0.0,
            start_timecode: "00:00:00".to_string(),
        }];
    }

    let interval = interval_sec.max(1.0);
    let raw_count = (duration_sec / interval).floor() as u32;
    let remainder = duration_sec % interval;
    let ch_count = (raw_count + if remainder > 30.0 { 1 } else { 0 }).max(1);

    (0..ch_count)
        .map(|c| {
            let start = (c as f64) * interval;
            let total_s = start.round() as u64;
            let h = total_s / 3600;
            let m = (total_s % 3600) / 60;
            let s = total_s % 60;
            PanasonicChapter {
                id: c + 1,
                title: format!("Chapter {}", c + 1),
                start_sec: start,
                start_timecode: format!("{h:02}:{m:02}:{s:02}"),
            }
        })
        .collect()
}

/// Pure evaluation of disk drive hardware identifiers and bus characteristics.
#[must_use]
pub fn evaluate_panasonic_drive(
    model: &str,
    iface: &str,
    pnp: &str,
) -> PanasonicDriveHeuristic {
    let model_l = model.to_lowercase();
    let iface_l = iface.to_lowercase();
    let pnp_l = pnp.to_lowercase();

    let is_usb = iface_l.contains("usb") || pnp_l.contains("usbstor") || model_l.contains("usb");
    let is_jmicron = model_l.contains("jmicron") || model_l.contains("jms") || pnp_l.contains("jmicron");
    let is_asmedia = model_l.contains("asmedia") || model_l.contains("asmt") || pnp_l.contains("asmedia");

    let is_nvme = pnp_l.contains("nvme")
        || model_l.contains("nvme")
        || iface_l.contains("nvme")
        || pnp_l.contains("pcie")
        || pnp_l.contains("scsi\\disk&ven_nvme");

    let bus_type = if is_usb {
        "USB".to_string()
    } else if is_nvme {
        "NVMe".to_string()
    } else if iface_l.contains("ide") || pnp_l.contains("ide") {
        "IDE".to_string()
    } else if iface_l.contains("scsi") && !pnp_l.contains("sata") && !pnp_l.contains("ata") {
        "SCSI".to_string()
    } else {
        "SATA".to_string()
    };

    let is_panasonic_model = model_l.contains("panasonic")
        || model_l.contains("matshita")
        || model_l.contains("dmr-e")
        || model_l.contains("dmr-ex")
        || model_l.contains("dmr-eh");

    let probable_format = if is_panasonic_model {
        PanasonicFilesystemFormat::MeihdfsV2
    } else {
        PanasonicFilesystemFormat::Unknown
    };

    PanasonicDriveHeuristic {
        is_panasonic: is_panasonic_model,
        bus_type,
        is_usb,
        is_jmicron_bridge: is_jmicron,
        is_asmedia_bridge: is_asmedia,
        probable_format,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classifies_meihdfs_v2_superblock() {
        let mut buf = vec![0_u8; 1024];
        buf[256..256 + SIG_MEIHDFS_V2.len()].copy_from_slice(SIG_MEIHDFS_V2);
        let res = classify_panasonic_probe(&buf, 160_000_000_000, "dump.img");
        assert!(res.is_panasonic);
        assert_eq!(res.format, PanasonicFilesystemFormat::MeihdfsV2);
        assert_eq!(res.detected_offsets, vec![256]);
        assert_eq!(res.estimated_titles, 1);
        assert!(res.can_extract);
    }

    #[test]
    fn test_classifies_dvd_vr_volume() {
        let mut buf = vec![0_u8; 1024];
        buf[64..64 + SIG_DVD_RTAV.len()].copy_from_slice(SIG_DVD_RTAV);
        let res = classify_panasonic_probe(&buf, 4_700_000_000, "disc.iso");
        assert!(res.is_panasonic);
        assert_eq!(res.format, PanasonicFilesystemFormat::DvdVr);
        assert_eq!(res.detected_offsets, vec![64]);
        assert!(res.can_extract);
    }

    #[test]
    fn test_classifies_panasonic_firmware_service_image() {
        let buf = vec![0x12_u8; 1024];
        let res = classify_panasonic_probe(
            &buf,
            PANASONIC_FIRMWARE_SIZE_BYTES,
            "panasonic_dmr_eh55_firmware_boot.img",
        );
        assert!(res.is_panasonic);
        assert_eq!(res.format, PanasonicFilesystemFormat::PanasonicFirmwareServiceImage);
        assert!(!res.can_extract);
    }

    #[test]
    fn test_generate_panasonic_chapters_calculation() {
        let chapters = generate_panasonic_chapters(3600.0, 900.0);
        assert_eq!(chapters.len(), 4);
        assert_eq!(chapters[0].start_timecode, "00:00:00");
        assert_eq!(chapters[1].start_timecode, "00:15:00");
        assert_eq!(chapters[2].start_timecode, "00:30:00");
        assert_eq!(chapters[3].start_timecode, "00:45:00");
    }

    #[test]
    fn test_evaluate_panasonic_drive_heuristics() {
        let h = evaluate_panasonic_drive(
            "MATSHITA DVD-RAM LF-D310",
            "SCSI",
            "USBSTOR\\CdRomMATSHITA_DVD-RAM_________",
        );
        assert!(h.is_panasonic);
        assert!(h.is_usb);
        assert_eq!(h.bus_type, "USB");
        assert_eq!(h.probable_format, PanasonicFilesystemFormat::MeihdfsV2);
    }
}
