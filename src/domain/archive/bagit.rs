//! Pure Functional OAIS BagIt (RFC 8493) Generator (`domain/archive/bagit.rs`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchivalFileEntry {
    pub relative_path: String,
    pub sha256_hex: String,
    pub size_bytes: u64,
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
