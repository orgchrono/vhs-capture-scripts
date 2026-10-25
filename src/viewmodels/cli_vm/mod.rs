//! Command-Line Interface (CLI) Dispatcher ViewModel (`viewmodels::cli_vm`).
//!
//! Provides the execution engine and subcommand dispatching for `vhs-studio` CLI.

pub mod args_parser;
pub mod commands_archive_qc;
pub mod commands_ingest_obs;
pub mod commands_restore;
pub mod commands_system_queue;

pub use args_parser::{build_cli_job_request, num_cpus, parse_preset, print_usage};
pub use commands_archive_qc::{collect_entries, package_oais_directory, OaisPackageSummary};
pub use commands_restore::run_job_and_report;

use commands_archive_qc::handle_archive_qc;
use commands_ingest_obs::handle_ingest_obs;
use commands_restore::handle_restore_commands;
use commands_system_queue::handle_system_queue;

/// Dispatches command line arguments to the appropriate ViewModel/service.
pub fn run_cli(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    let subcmd = args[1].as_str();

    // 1. Try restore & subtitling commands
    if handle_restore_commands(subcmd, args)? {
        return Ok(());
    }

    // 2. Try archival & QC commands
    if handle_archive_qc(subcmd, args)? {
        return Ok(());
    }

    // 3. Try ingest & OBS trigger commands
    if handle_ingest_obs(subcmd, args)? {
        return Ok(());
    }

    // 4. Try system, storage, toolchain & desktop commands
    if handle_system_queue(subcmd, args)? {
        return Ok(());
    }

    // Unrecognized command
    eprintln!("Unknown command: '{subcmd}'");
    print_usage();
    std::process::exit(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_package_oais_directory_workflow() {
        let temp_dir = std::env::temp_dir().join(format!("vhs_test_oais_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("create temp dir");

        let test_file = temp_dir.join("tape_master.mkv");
        fs::write(&test_file, b"DUMMY_ARCHIVAL_CONTAINER_PAYLOAD").expect("write test file");

        let summary = package_oais_directory(
            &temp_dir,
            "National Archives Audiovisual Lab",
            "Family VHS Archival Master 1994",
        )
        .expect("package directory");

        assert_eq!(summary.total_files, 1);
        assert_eq!(summary.total_bytes, 32);

        let manifest_path = temp_dir.join("manifest-sha256.txt");
        assert!(manifest_path.exists());
        let manifest_content = fs::read_to_string(&manifest_path).unwrap();
        assert!(manifest_content.contains("tape_master.mkv"));

        let bag_info_path = temp_dir.join("bag-info.txt");
        assert!(bag_info_path.exists());
        let bag_info_content = fs::read_to_string(&bag_info_path).unwrap();
        assert!(bag_info_content.contains("Source-Organization: National Archives Audiovisual Lab"));
        assert!(bag_info_content.contains("Payload-Oxum: 32.1"));

        let premis_path = temp_dir.join("premis.xml");
        assert!(premis_path.exists());
        let premis_content = fs::read_to_string(&premis_path).unwrap();
        assert!(premis_content.contains("<objectIdentifierValue>tape_master.mkv</objectIdentifierValue>"));
        assert!(premis_content.contains("<eventType>ingestion</eventType>"));
        assert!(premis_content.contains("<eventType>fixity check</eventType>"));

        // Verify OAIS package with verification report
        let report = crate::domain::archive::verify_oais_directory(&temp_dir).expect("verify oais directory");
        assert!(report.is_valid);
        assert_eq!(report.missing_files.len(), 0);
        assert_eq!(report.corrupted_files.len(), 0);
        assert_eq!(report.valid_files.len(), 1);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
