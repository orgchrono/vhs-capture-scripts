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

impl PanasonicFilesystemFormat {
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::MeihdfsV2 => "MEIHDFS-V2.0",
            Self::MeihdfsV1 => "MEIHDFS-V1.0",
            Self::MeihdfsGeneric => "MEIHDFS",
            Self::DvdVr => "DVD-VR",
            Self::Mpeg2PsStream => "MPEG2-PS-STREAM",
            Self::PanasonicFirmwareServiceImage => "PANASONIC_FIRMWARE_SERVICE_IMAGE",
            Self::Unknown => "UNKNOWN",
        }
    }
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PanasonicDiskInfo {
    pub device_id: String,
    pub name: String,
    pub model: String,
    pub size_gb: f64,
    pub is_panasonic: bool,
    pub format: String,
    pub needs_elevation: bool,
    pub is_usb: bool,
    pub is_jmicron: bool,
    pub is_asmedia: bool,
    pub bus_type: String,
}

/// Pure parser decoding drive list JSON (such as PowerShell or lsblk JSON output).
#[must_use]
pub fn parse_drive_entries_from_json(json_content: &str) -> Vec<PanasonicDiskInfo> {
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(json_content);
    let Ok(val) = parsed else {
        return Vec::new();
    };

    let items = match val {
        serde_json::Value::Array(arr) => arr,
        obj @ serde_json::Value::Object(_) => vec![obj],
        _ => return Vec::new(),
    };

    items
        .into_iter()
        .map(|item| {
            let dev_id = item.get("DeviceID").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let model = item.get("Model").and_then(|v| v.as_str()).unwrap_or("Hard Disk Drive").to_string();
            let size_b = item.get("Size").and_then(|v| v.as_u64()).unwrap_or(0);
            let size_gb = ((size_b as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0;
            let iface = item.get("InterfaceType").and_then(|v| v.as_str()).unwrap_or("");
            let pnp = item.get("PNPDeviceID").and_then(|v| v.as_str()).unwrap_or("");

            let h = evaluate_panasonic_drive(&model, iface, pnp);
            let name = format!("{model} ({size_gb:.1} GB)");

            PanasonicDiskInfo {
                device_id: dev_id,
                name,
                model,
                size_gb,
                is_panasonic: h.is_panasonic,
                format: h.probable_format.as_str().to_string(),
                needs_elevation: false,
                is_usb: h.is_usb,
                is_jmicron: h.is_jmicron_bridge,
                is_asmedia: h.is_asmedia_bridge,
                bus_type: h.bus_type,
            }
        })
        .collect()
}

/// Scan connected physical disks and return structured hardware diagnostics without window flashing.
#[must_use]
pub fn detect_connected_drives() -> Vec<PanasonicDiskInfo> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let mut cmd = Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_DiskDrive | Select-Object DeviceID, Model, Size, InterfaceType, PNPDeviceID | ConvertTo-Json",
        ]);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let output = cmd.output().ok();
        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            return parse_drive_entries_from_json(&stdout);
        }
        Vec::new()
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let mut cmd = Command::new("lsblk");
        cmd.args(["-J", "-b", "-o", "NAME,PATH,MODEL,SIZE,TYPE,TRAN"]);
        let output = cmd.output().ok();
        if let Some(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if let Some(devices) = val.get("blockdevices").and_then(|d| d.as_array()) {
                    return devices.iter().filter_map(|dev| {
                        let path = dev.get("path").and_then(|p| p.as_str()).or_else(|| {
                            dev.get("name").and_then(|n| n.as_str()).map(|n| format!("/dev/{n}"))
                        }).unwrap_or_default();
                        let model = dev.get("model").and_then(|m| m.as_str()).unwrap_or("Block Device").trim().to_string();
                        let size_b = dev.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                        let size_gb = ((size_b as f64) / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0;
                        let tran = dev.get("tran").and_then(|t| t.as_str()).unwrap_or("");
                        let h = evaluate_panasonic_drive(&model, tran, "");
                        Some(PanasonicDiskInfo {
                            device_id: path,
                            name: format!("{model} ({size_gb:.1} GB)"),
                            model,
                            size_gb,
                            is_panasonic: h.is_panasonic,
                            format: h.probable_format.as_str().to_string(),
                            needs_elevation: false,
                            is_usb: h.is_usb,
                            is_jmicron: h.is_jmicron_bridge,
                            is_asmedia: h.is_asmedia_bridge,
                            bus_type: h.bus_type,
                        })
                    }).collect();
                }
            }
        }
        Vec::new()
    }

    #[cfg(target_os = "macos")]
    {
        Vec::new()
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

    #[test]
    fn test_parse_drive_entries_from_json() {
        let json_sample = r#"[
            {
                "DeviceID": "\\\\.\\PHYSICALDRIVE1",
                "Model": "MATSHITA DVD-RAM SW-9585",
                "Size": 160041885696,
                "InterfaceType": "USB",
                "PNPDeviceID": "USBSTOR\\DISK&VEN_MATSHITA&PROD_DVD-RAM"
            },
            {
                "DeviceID": "\\\\.\\PHYSICALDRIVE0",
                "Model": "Samsung SSD 980 PRO 1TB",
                "Size": 1000204886016,
                "InterfaceType": "SCSI",
                "PNPDeviceID": "SCSI\\DISK&VEN_NVME&PROD_SAMSUNG_SSD_980"
            }
        ]"#;

        let drives = parse_drive_entries_from_json(json_sample);
        assert_eq!(drives.len(), 2);

        // Panasonic DVD drive
        assert_eq!(drives[0].device_id, "\\\\.\\PHYSICALDRIVE1");
        assert!(drives[0].is_panasonic);
        assert_eq!(drives[0].bus_type, "USB");
        assert_eq!(drives[0].format, "MEIHDFS-V2.0");

        // Non-panasonic NVMe SSD
        assert_eq!(drives[1].device_id, "\\\\.\\PHYSICALDRIVE0");
        assert!(!drives[1].is_panasonic);
        assert_eq!(drives[1].bus_type, "NVMe");
        assert_eq!(drives[1].format, "UNKNOWN");
    }
}
