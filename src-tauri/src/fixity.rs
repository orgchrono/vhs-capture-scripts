//! Pure Cryptographic SHA-256 Fixity & OAIS Archival Verification Module.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FixityRecord {
    pub artifact_name: String,
    pub sha256_hex: String,
    pub size_bytes: u64,
}

/// Computes a lowercase hexadecimal SHA-256 digest of a byte slice.
#[must_use]
pub fn compute_sha256_hex(payload: &[u8]) -> String {
    let digest = Sha256::digest(payload);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Pure verification of a byte payload against an expected SHA-256 hex digest.
#[must_use]
pub fn verify_payload_fixity(payload: &[u8], expected_sha256_hex: &str) -> bool {
    let actual = compute_sha256_hex(payload);
    actual.eq_ignore_ascii_case(expected_sha256_hex.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_deterministic_sha256_digest() {
        let digest = compute_sha256_hex(b"VHS_STUDIO_PRO_OAIS_FIXITY");
        assert_eq!(
            digest,
            "9dbd18843964c9501def4e043b053877d8ec80c183cc03705f11c4304b220a26"
        );
        assert!(verify_payload_fixity(
            b"VHS_STUDIO_PRO_OAIS_FIXITY",
            "9DBD18843964C9501DEF4E043B053877D8EC80C183CC03705F11C4304B220A26"
        ));
    }
}
