//! Tool integrity and SHA-256 fixity manifest validation.

use super::types::ChecksumsManifest;

/// Validates binary SHA-256 against a parsed checksums manifest.
#[must_use]
pub fn verify_binary_integrity(
    binary_filename: &str,
    actual_sha256: &str,
    platform_key: &str,
    manifest_json: &str,
) -> (bool, String) {
    let manifest: ChecksumsManifest = match serde_json::from_str(manifest_json) {
        Ok(m) => m,
        Err(err) => return (false, format!("Failed to parse checksums manifest: {err}")),
    };

    let platform_bins = match manifest.binaries.get(platform_key) {
        Some(bins) => bins,
        None => {
            return (
                true,
                format!("Platform '{platform_key}' not indexed in manifest; integrity check skipped"),
            )
        }
    };

    let entry = match platform_bins.get(binary_filename) {
        Some(e) => e,
        None => {
            return (
                true,
                format!("Binary '{binary_filename}' is locally compiled or unindexed"),
            )
        }
    };

    let expected = entry.sha256.to_lowercase();
    let actual = actual_sha256.to_lowercase();

    if expected == actual {
        (true, format!("Verified SHA-256: {actual}"))
    } else {
        (
            false,
            format!("INTEGRITY MISMATCH for '{binary_filename}': expected {expected}, calculated {actual}"),
        )
    }
}
