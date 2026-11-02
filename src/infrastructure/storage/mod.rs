//! Pure Functional Storage Provider Validation, Quota Checking, and Key Path Resolvers (`infrastructure::storage`).
//!
//! Models storage backends (Local/NAS/USB, Google Drive, Supabase, Dropbox, OneDrive, S3),
//! validates configuration dictionaries, verifies disk capacity against required ingest quotas,
//! provides chunk upload planning, and manages persistent storage settings.

pub mod config;
pub mod file_ops;
pub mod oais_verifier;

pub use config::{
    evaluate_storage_status, load_storage_config_envelope, query_disk_space,
    resolve_storage_config_path, save_storage_config_envelope, StorageConfigEnvelope, StorageStatus,
};
pub use file_ops::{compute_file_sha256_hex, copy_and_verify_file, set_file_readonly};
pub use oais_verifier::verify_oais_directory;

pub use crate::domain::storage::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validates_local_storage_config() {
        let valid = StorageConfig {
            provider: StorageProviderKind::LocalNasUsb,
            base_path: Some("/media/archive".to_string()),
            bucket: None,
            endpoint: None,
            region: None,
            has_credentials: false,
        };
        assert!(validate_storage_config(&valid).is_ok());

        let invalid = StorageConfig {
            provider: StorageProviderKind::LocalNasUsb,
            base_path: Some("   ".to_string()),
            bucket: None,
            endpoint: None,
            region: None,
            has_credentials: false,
        };
        assert!(validate_storage_config(&invalid).is_err());
    }

    #[test]
    fn test_validates_s3_storage_config() {
        let valid = StorageConfig {
            provider: StorageProviderKind::S3,
            base_path: None,
            bucket: Some("vhs-vault".to_string()),
            endpoint: None,
            region: Some("us-east-1".to_string()),
            has_credentials: true,
        };
        assert!(validate_storage_config(&valid).is_ok());

        let unauthed = StorageConfig {
            provider: StorageProviderKind::S3,
            base_path: None,
            bucket: Some("vhs-vault".to_string()),
            endpoint: None,
            region: Some("us-east-1".to_string()),
            has_credentials: false,
        };
        assert!(validate_storage_config(&unauthed).is_err());
    }

    #[test]
    fn test_verify_capacity_with_safety_margin() {
        let required = 10_000_000_000; // 10 GB
        let available_plenty = 20_000_000_000; // 20 GB
        assert!(verify_capacity(available_plenty, required).is_ok());

        let available_exact = 10_500_000_000; // 10.5 GB (less than 10GB + 1GB margin)
        assert!(verify_capacity(available_exact, required).is_err());
    }

    #[test]
    fn test_format_destination_key_normalizes_slashes() {
        let key = format_destination_key("/vhs_captures\\2026/", "\\tapes\\family.mkv");
        assert_eq!(key, "vhs_captures/2026/tapes/family.mkv");

        let root_key = format_destination_key("", "tape1.mp4");
        assert_eq!(root_key, "tape1.mp4");
    }

    #[test]
    fn test_calculate_chunk_plan() {
        let plan = calculate_chunk_plan(25_000_000, 10_000_000);
        assert_eq!(plan.len(), 3);

        assert_eq!(plan[0].part_number, 1);
        assert_eq!(plan[0].start_byte, 0);
        assert_eq!(plan[0].end_byte, 9_999_999);
        assert_eq!(plan[0].part_size, 10_000_000);
        assert!(!plan[0].is_last);

        assert_eq!(plan[1].part_number, 2);
        assert_eq!(plan[1].start_byte, 10_000_000);
        assert_eq!(plan[1].end_byte, 19_999_999);
        assert_eq!(plan[1].part_size, 10_000_000);
        assert!(!plan[1].is_last);

        assert_eq!(plan[2].part_number, 3);
        assert_eq!(plan[2].start_byte, 20_000_000);
        assert_eq!(plan[2].end_byte, 24_999_999);
        assert_eq!(plan[2].part_size, 5_000_000);
        assert!(plan[2].is_last);
    }

    #[test]
    fn test_evaluate_storage_status_for_providers() {
        let s3_cfg = serde_json::json!({
            "S3_ACCESS_KEY": "AKIAIOSFODNN7EXAMPLE",
            "S3_SECRET_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        });
        let s3_status = evaluate_storage_status("s3_generic", &s3_cfg);
        assert!(s3_status.ready);

        let unauthed_s3 = serde_json::json!({
            "S3_ACCESS_KEY": "",
            "S3_SECRET_KEY": ""
        });
        let unauthed_status = evaluate_storage_status("s3_generic", &unauthed_s3);
        assert!(!unauthed_status.ready);

        let supabase_cfg = serde_json::json!({
            "SUPABASE_KEY": "sbp_abcdef123456"
        });
        let supabase_status = evaluate_storage_status("supabase", &supabase_cfg);
        assert!(supabase_status.ready);
    }

    #[test]
    fn test_load_and_save_storage_config_envelope_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_storage_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let config_file = temp_dir.join("storage.json");

        let default_env = load_storage_config_envelope(&config_file);
        assert_eq!(default_env.provider, "local_nas_usb");

        let custom_cfg = serde_json::json!({
            "S3_ACCESS_KEY": "MOCK_KEY",
            "S3_SECRET_KEY": "MOCK_SECRET"
        });
        let save_res = save_storage_config_envelope(&config_file, "s3_generic", &custom_cfg);
        assert!(save_res.is_ok());

        let loaded_env = load_storage_config_envelope(&config_file);
        assert_eq!(loaded_env.provider, "s3_generic");
        assert!(loaded_env.status.ready);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_copy_and_verify_file_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_copy_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let src = temp_dir.join("source.txt");
        let dst = temp_dir.join("subfolder").join("dest.txt");
        std::fs::write(&src, b"VHS Studio Archive Test Payload").unwrap();

        let copy_res = copy_and_verify_file(&src, &dst);
        assert!(copy_res.is_ok());
        assert_eq!(copy_res.unwrap(), 31);
        assert_eq!(std::fs::read(&dst).unwrap(), b"VHS Studio Archive Test Payload");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_verify_oais_directory() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_oais_verify_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).expect("create test dir");

        let master_file = temp_dir.join("tape_master.mkv");
        let proxy_file = temp_dir.join("tape_proxy.mp4");
        std::fs::write(&master_file, b"MASTER_CONTENT_12345").unwrap();
        std::fs::write(&proxy_file, b"PROXY_CONTENT_67890").unwrap();

        let master_hash = compute_file_sha256_hex(&master_file).unwrap();
        let proxy_hash = compute_file_sha256_hex(&proxy_file).unwrap();

        let manifest_file = temp_dir.join("tape_manifest-sha256.txt");
        let manifest_content = format!("{master_hash}  tape_master.mkv\n{proxy_hash}  tape_proxy.mp4\n");
        std::fs::write(&manifest_file, manifest_content).unwrap();

        let report = verify_oais_directory(&temp_dir).expect("verification should succeed");
        assert!(report.is_valid);
        assert_eq!(report.total_files_checked, 2);
        assert_eq!(report.valid_files.len(), 2);
        assert!(report.corrupted_files.is_empty());
        assert!(report.missing_files.is_empty());

        // Test corruption detection
        std::fs::write(&proxy_file, b"TAMPERED_CONTENT").unwrap();
        let report_bad = verify_oais_directory(&temp_dir).expect("verification should run");
        assert!(!report_bad.is_valid);
        assert_eq!(report_bad.corrupted_files.len(), 1);
        assert_eq!(report_bad.corrupted_files[0], "tape_proxy.mp4");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
