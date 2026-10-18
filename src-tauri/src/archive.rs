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
}
