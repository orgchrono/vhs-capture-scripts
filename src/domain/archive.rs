//! Pure Functional Archival Packaging, OAIS BagIt (RFC 8493), PREMIS v3 XML, and Sidecars.
//!
//! Generates standard digital preservation manifests, cryptographic fixity listings,
//! and Library of Congress PREMIS v3 preservation metadata.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivalFileEntry {
    pub relative_path: String,
    pub sha256_hex: String,
    pub size_bytes: u64,
}

/// PREMIS v3 event record documenting digital preservation actions and custody transitions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PremisEvent {
    pub event_id: String,
    pub event_type: String, // e.g., "ingestion", "deinterlacing", "restoration_filtering", "fixity check"
    pub event_datetime: String,
    pub event_detail: String,
    pub event_outcome: String, // e.g., "success"
    pub linking_agent_id: String,
}

/// PREMIS v3 agent record representing hardware, software, or organizations performing archival actions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PremisAgent {
    pub agent_id: String,
    pub agent_name: String, // e.g., "VHS Studio Pro Native Engine v2.1.0"
    pub agent_type: String, // e.g., "software"
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TapeSidecarMetadata {
    pub version: String,
    pub timestamp: f64,
    pub original_file: String,
    pub metadata: serde_json::Value,
}

/// Pure BagIt declaration text generator complying with RFC 8493.
#[must_use]
pub fn generate_bagit_declaration() -> &'static str {
    "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n"
}

/// Pure SHA-256 BagIt manifest generator formatted as `<checksum>  <relative_path>`.
#[must_use]
pub fn generate_bagit_manifest(entries: &[ArchivalFileEntry]) -> String {
    let mut manifest = String::new();
    for entry in entries {
        let clean_path = entry.relative_path.replace('\\', "/");
        manifest.push_str(&format!("{} data/{}\n", entry.sha256_hex, clean_path));
    }
    manifest
}

/// Pure PREMIS v3 XML preservation metadata generator for archival masters.
#[must_use]
pub fn generate_premis_v3_xml(
    filename: &str,
    size_bytes: u64,
    sha256_hex: &str,
) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<premis xmlns="http://www.loc.gov/premis/v3" version="3.0">
  <object xsi:type="file" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{filename}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <size>{size_bytes}</size>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{sha256_hex}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{filename}</originalName>
  </object>
</premis>
"#
    )
}

/// Pure BagIt `bag-info.txt` generator complying with RFC 8493.
#[must_use]
pub fn generate_bag_info_txt(
    source_organization: &str,
    external_description: &str,
    payload_oxum_bytes: u64,
    file_count: usize,
    bagging_date: &str,
) -> String {
    format!(
        "Bag-Software-Agent: VHS Studio Pro v2.1.0\nBagging-Date: {bagging_date}\nSource-Organization: {source_organization}\nExternal-Description: {external_description}\nPayload-Oxum: {payload_oxum_bytes}.{file_count}\n"
    )
}

/// Pure PREMIS v3 XML generator representing complete OAIS derivation relationship, events, and agents.
#[must_use]
pub fn generate_full_premis_v3_xml(
    source_file: &str,
    source_sha256: &str,
    master_file: &str,
    master_size: u64,
    master_sha256: &str,
    events: &[PremisEvent],
    agents: &[PremisAgent],
) -> String {
    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<premis xmlns="http://www.loc.gov/premis/v3" version="3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
"#,
    );

    // Source Object
    xml.push_str(&format!(
        r#"  <object xsi:type="file">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{source_file}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{source_sha256}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{source_file}</originalName>
  </object>
"#
    ));

    // Master Object (with derivation relationship to source)
    xml.push_str(&format!(
        r#"  <object xsi:type="file">
    <objectIdentifier>
      <objectIdentifierType>local</objectIdentifierType>
      <objectIdentifierValue>{master_file}</objectIdentifierValue>
    </objectIdentifier>
    <objectCharacteristics>
      <size>{master_size}</size>
      <fixity>
        <messageDigestAlgorithm>SHA-256</messageDigestAlgorithm>
        <messageDigest>{master_sha256}</messageDigest>
      </fixity>
    </objectCharacteristics>
    <originalName>{master_file}</originalName>
    <relationship>
      <relationshipType>derivation</relationshipType>
      <relationshipSubType>has source</relationshipSubType>
      <relatedObjectIdentifier>
        <relatedObjectIdentifierType>local</relatedObjectIdentifierType>
        <relatedObjectIdentifierValue>{source_file}</relatedObjectIdentifierValue>
      </relatedObjectIdentifier>
    </relationship>
  </object>
"#
    ));

    // Preservation Events
    for ev in events {
        xml.push_str(&format!(
            r#"  <event>
    <eventIdentifier>
      <eventIdentifierType>local</eventIdentifierType>
      <eventIdentifierValue>{}</eventIdentifierValue>
    </eventIdentifier>
    <eventType>{}</eventType>
    <eventDateTime>{}</eventDateTime>
    <eventDetailInformation>
      <eventDetail>{}</eventDetail>
    </eventDetailInformation>
    <eventOutcomeInformation>
      <eventOutcome>{}</eventOutcome>
    </eventOutcomeInformation>
    <linkingAgentIdentifier>
      <linkingAgentIdentifierType>local</linkingAgentIdentifierType>
      <linkingAgentIdentifierValue>{}</linkingAgentIdentifierValue>
    </linkingAgentIdentifier>
    <linkingObjectIdentifier>
      <linkingObjectIdentifierType>local</linkingObjectIdentifierType>
      <linkingObjectIdentifierValue>{master_file}</linkingObjectIdentifierValue>
    </linkingObjectIdentifier>
  </event>
"#,
            ev.event_id, ev.event_type, ev.event_datetime, ev.event_detail, ev.event_outcome, ev.linking_agent_id
        ));
    }

    // Preservation Agents
    for ag in agents {
        xml.push_str(&format!(
            r#"  <agent>
    <agentIdentifier>
      <agentIdentifierType>local</agentIdentifierType>
      <agentIdentifierValue>{}</agentIdentifierValue>
    </agentIdentifier>
    <agentName>{}</agentName>
    <agentType>{}</agentType>
  </agent>
"#,
            ag.agent_id, ag.agent_name, ag.agent_type
        ));
    }

    xml.push_str("</premis>\n");
    xml
}

/// Pure tape sidecar metadata JSON generator.
#[must_use]
pub fn generate_tape_sidecar_json(
    filename: &str,
    timestamp: f64,
    metadata: &serde_json::Value,
) -> String {
    let payload = TapeSidecarMetadata {
        version: "1.0".to_string(),
        timestamp,
        original_file: filename.to_string(),
        metadata: metadata.clone(),
    };
    serde_json::to_string_pretty(&payload).unwrap_or_else(|_| "{}".to_string())
}

/// Sets read-only permissions on an archival master file to prevent accidental deletion or modification.
pub fn set_file_readonly(path: &std::path::Path) -> std::io::Result<()> {
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_readonly(true);
    std::fs::set_permissions(path, perms)
}

/// Evaluates whether an archival backup plan satisfies the 3-2-1 digital preservation rule:
/// At least 3 copies, on 2 different media formats/locations, with at least 1 offsite/cloud copy.
#[must_use]
pub fn evaluate_321_compliance(
    total_copies: usize,
    distinct_media_locations: usize,
    has_remote_or_cloud_copy: bool,
) -> bool {
    total_copies >= 3 && distinct_media_locations >= 2 && has_remote_or_cloud_copy
}


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
}

