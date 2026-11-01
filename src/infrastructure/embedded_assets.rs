//! Embedded Assets Bridge (UI Distribution & Bundled Toolchain Utilities).
//!
//! Provides zero-disk-dependency fallback serving for static frontend files
//! and embedded vendor tools directly from compiled binary memory.

include!(concat!(env!("OUT_DIR"), "/embedded_assets_gen.rs"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedded_assets_compilation() {
        // Calling extract_embedded_tools into temp directory should succeed without errors
        let tmp = std::env::temp_dir().join(format!("vhs_embed_test_{}", std::process::id()));
        let res = extract_embedded_tools(&tmp);
        assert!(res.is_ok());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
