//! Panasonic DVR Ingestion, Partition Parsing, and Hardware Drive Scanner.
//!
//! Re-exports pure filesystem models from `domain::panasonic_format` and provides
//! low-level disk sector probing and OS hardware discovery.

pub mod drive_scanner;
pub mod probe_io;

pub use crate::domain::panasonic_format::*;
pub use drive_scanner::*;
pub use probe_io::*;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::{Seek, SeekFrom};
    use std::path::Path;

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

    #[test]
    fn test_inspect_panasonic_file_not_found() {
        let dummy_path = Path::new("non_existent_panasonic_dump_12345.img");
        let res = inspect_panasonic_file(dummy_path);
        assert!(res.is_err());
    }

    #[test]
    fn test_inspect_panasonic_file_deep_seek() {
        use std::io::Write;
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join(format!("test_panasonic_deep_{}.img", std::process::id()));

        // Create file and seek to PANASONIC_MEIHDFS_OFFSETS[0]
        let offset = PANASONIC_MEIHDFS_OFFSETS[0];
        let mut f = File::create(&test_file).expect("Failed to create temp test file");
        f.seek(SeekFrom::Start(offset)).expect("Failed to seek");
        f.write_all(SIG_MEIHDFS_V2).expect("Failed to write signature");
        f.write_all(&vec![0u8; 1024]).expect("Failed to write padding");
        drop(f);

        let res = inspect_panasonic_file(&test_file);
        let _ = std::fs::remove_file(&test_file);

        let (insp, size) = res.expect("inspect_panasonic_file should succeed");
        assert!(insp.is_panasonic);
        assert_eq!(insp.format, PanasonicFilesystemFormat::MeihdfsV2);
        assert_eq!(insp.detected_offsets, vec![offset as usize]);
        assert!(size >= offset);
    }

    #[test]
    fn test_detects_meihdfs_superblock() {
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
    fn test_detects_dvd_rtav_ifo_header() {
        let mut sector = vec![0_u8; 256];
        sector[0..11].copy_from_slice(b"DVD_RTR_VMG");
        let desc = inspect_panasonic_probe(&sector, 4_700_000_000, false)
            .expect("should detect DVD_RTAV");
        assert_eq!(desc.format_kind, PanasonicFormatKind::DvdRtavUdf);
        assert_eq!(desc.signature_offset, Some(0));
    }

    #[test]
    fn test_rejects_unknown_binary_payload() {
        let random_sector = vec![0xAA_u8; 512];
        let res = inspect_panasonic_probe(&random_sector, 1024, false);
        assert_eq!(res, Err(IngestProbeError::UnrecognizedFilesystem));
    }
}
