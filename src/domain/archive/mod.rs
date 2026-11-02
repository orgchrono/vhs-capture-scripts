//! Pure Functional Archival Packaging, OAIS BagIt (RFC 8493), PREMIS v3 XML, and Sidecars.
//!
//! Generates standard digital preservation manifests, cryptographic fixity listings,
//! and Library of Congress PREMIS v3 preservation metadata.

pub mod bagit;
pub mod metadata;
pub mod premis;

pub use bagit::*;
pub use metadata::*;
pub use premis::*;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_bagit_declaration_and_manifest() {
        assert_eq!(
            generate_bagit_declaration(),
            "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n"
        );

        let entries = vec![
            ArchivalFileEntry {
                relative_path: "master.mkv".to_string(),
                sha256_hex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                size_bytes: 1024,
            },
            ArchivalFileEntry {
                relative_path: "subfolder\\audio.flac".to_string(),
                sha256_hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad".to_string(),
                size_bytes: 2048,
            },
        ];

        let manifest = generate_bagit_manifest(&entries);
        assert!(manifest.contains("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 data/master.mkv\n"));
        assert!(manifest.contains("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad data/subfolder/audio.flac\n"));
    }

    #[test]
    fn test_premis_v3_xml_generation() {
        let xml = generate_premis_v3_xml("tape_001_master.mkv", 10_485_760, "abcdef123456");
        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(xml.contains("<objectIdentifierValue>tape_001_master.mkv</objectIdentifierValue>"));
        assert!(xml.contains("<size>10485760</size>"));
        assert!(xml.contains("<messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>"));
        assert!(xml.contains("<messageDigest>abcdef123456</messageDigest>"));
    }

    #[test]
    fn test_tape_sidecar_json_generation() {
        let meta = json!({
            "vcr_deck": "Panasonic AG-7750",
            "tbc_enabled": true,
            "tape_format": "NTSC"
        });
        let sidecar = generate_tape_sidecar_json("capture.avi", 1700000000.0, &meta);
        assert!(sidecar.contains("\"version\": \"1.0\""));
        assert!(sidecar.contains("\"original_file\": \"capture.avi\""));
        assert!(sidecar.contains("\"Panasonic AG-7750\""));
    }

    #[test]
    fn test_evaluate_321_compliance() {
        assert!(evaluate_321_compliance(3, 2, true));
        assert!(evaluate_321_compliance(4, 3, true));
        // Missing cloud copy
        assert!(!evaluate_321_compliance(3, 2, false));
        // Not enough total copies
        assert!(!evaluate_321_compliance(2, 2, true));
        // Not enough media diversity
        assert!(!evaluate_321_compliance(3, 1, true));
    }

    #[test]
    fn test_generate_bag_info_txt() {
        let txt = generate_bag_info_txt(
            "Library of Congress AV Preservation",
            "Archival Master Tape Package",
            104857600,
            3,
            "2026-10-25",
        );
        assert!(txt.contains("Source-Organization: Library of Congress AV Preservation"));
        assert!(txt.contains("External-Description: Archival Master Tape Package"));
        assert!(txt.contains("Payload-Oxum: 104857600.3"));
        assert!(txt.contains("Bagging-Date: 2026-10-25"));
    }

    #[test]
    fn test_generate_full_premis_v3_xml() {
        let events = vec![
            PremisEvent {
                event_id: "evt-001".to_string(),
                event_type: "ingestion".to_string(),
                event_datetime: "2026-10-25T00:00:00Z".to_string(),
                event_detail: "Capture ingest from Panasonic AG-7750".to_string(),
                event_outcome: "success".to_string(),
                linking_agent_id: "agent-001".to_string(),
            },
            PremisEvent {
                event_id: "evt-002".to_string(),
                event_type: "deinterlacing".to_string(),
                event_datetime: "2026-10-25T00:10:00Z".to_string(),
                event_detail: "QTGMC 60p motion compensated reconstruction".to_string(),
                event_outcome: "success".to_string(),
                linking_agent_id: "agent-001".to_string(),
            },
        ];

        let agents = vec![
            PremisAgent {
                agent_id: "agent-001".to_string(),
                agent_name: "VHS Studio Pro Native Engine v2.1.0".to_string(),
                agent_type: "software".to_string(),
            },
        ];

        let xml = generate_full_premis_v3_xml(
            "tape_raw.mkv",
            "1111222233334444",
            "tape_master.mkv",
            50000000,
            "5555666677778888",
            &events,
            &agents,
        );

        assert!(xml.contains("<objectIdentifierValue>tape_raw.mkv</objectIdentifierValue>"));
        assert!(xml.contains("<messageDigest>1111222233334444</messageDigest>"));
        assert!(xml.contains("<objectIdentifierValue>tape_master.mkv</objectIdentifierValue>"));
        assert!(xml.contains("<relationshipType>derivation</relationshipType>"));
        assert!(xml.contains("<relationshipSubType>has source</relationshipSubType>"));
        assert!(xml.contains("<eventType>ingestion</eventType>"));
        assert!(xml.contains("<eventType>deinterlacing</eventType>"));
        assert!(xml.contains("<agentName>VHS Studio Pro Native Engine v2.1.0</agentName>"));
    }

    #[test]
    fn test_generate_full_premis_v3_xml_with_dip() {
        let events = vec![];
        let agents = vec![];

        let xml = generate_full_premis_v3_xml_with_dip(
            "raw.mkv",
            "aaa111",
            "master.mkv",
            1000,
            "bbb222",
            Some(("master_proxy.mp4", 500, "ccc333")),
            &events,
            &agents,
        );

        assert!(xml.contains("<objectIdentifierValue>master_proxy.mp4</objectIdentifierValue>"));
        assert!(xml.contains("<compositionLevel>0</compositionLevel>"));
        assert!(xml.contains("<formatName>video/mp4</formatName>"));
        assert!(xml.contains("<messageDigest>ccc333</messageDigest>"));
        assert!(xml.contains("<relatedObjectIdentifierValue>master.mkv</relatedObjectIdentifierValue>"));
    }
}
