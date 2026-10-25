//! Ingestion, Hardware Drives & OBS Trigger Evaluation CLI Commands (`cli_vm/commands_ingest_obs.rs`).

use std::path::Path;
use crate::infrastructure::panasonic::inspect_panasonic_file;

pub fn handle_ingest_obs(subcmd: &str, args: &[String]) -> Result<bool, Box<dyn std::error::Error>> {
    match subcmd {
        "probe-panasonic" => {
            let path_str = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing file path. Usage: vhs-studio probe-panasonic <PATH>");
                    std::process::exit(1);
                }
            };
            let (inspection, _) = match inspect_panasonic_file(Path::new(path_str)) {
                Ok(res) => res,
                Err(e) => {
                    eprintln!("Error inspecting Panasonic media '{path_str}': {e}");
                    std::process::exit(1);
                }
            };
            println!("{}", serde_json::to_string_pretty(&inspection)?);
            Ok(true)
        }
        "watch-ingest" | "watcher" => {
            let dir_str = match args.get(2) {
                Some(d) => d,
                None => {
                    eprintln!(
                        "Error: Missing directory argument. Usage: vhs-studio watch-ingest <DIR>"
                    );
                    std::process::exit(1);
                }
            };
            let dir_path = Path::new(dir_str);
            let entries = crate::models::media::scan_media_directory(dir_path)?;
            let ready_files: Vec<crate::models::media::MediaFileEntry> = entries
                .into_iter()
                .filter(|e| {
                    crate::models::media::is_file_ready_for_ingest(Path::new(&e.path), 1024)
                })
                .collect();

            println!("{}", serde_json::to_string_pretty(&ready_files)?);
            Ok(true)
        }
        "obs-eval-trigger" => {
            let is_recording: bool = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(false);
            let has_audio: bool = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(false);
            let is_blank: bool = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(false);
            let is_active: bool = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(false);
            let active_sec: f64 = args.get(6).and_then(|s| s.parse().ok()).unwrap_or(0.0);
            let blank_sec: f64 = args.get(7).and_then(|s| s.parse().ok()).unwrap_or(0.0);
            let quiet_sec: f64 = args.get(8).and_then(|s| s.parse().ok()).unwrap_or(0.0);

            let visual = crate::infrastructure::obs::VisualFrameAnalysis {
                r_avg: 128.0,
                g_avg: 128.0,
                b_avg: 128.0,
                is_black: false,
                is_blue: false,
                is_solid: false,
                is_blank,
                is_active,
                variance: if is_active { 30.0 } else { 5.0 },
                diff: if is_active { 3.0 } else { 0.0 },
            };

            let decision = crate::infrastructure::obs::evaluate_capture_trigger(
                is_recording,
                has_audio,
                Some(&visual),
                active_sec,
                blank_sec,
                quiet_sec,
                0.10,
                3.5,
                25.0,
            );

            println!("{}", serde_json::to_string_pretty(&decision)?);
            Ok(true)
        }
        "detect-drives" => {
            let drives = crate::infrastructure::panasonic::detect_connected_drives();
            println!("{}", serde_json::to_string_pretty(&drives)?);
            Ok(true)
        }
        _ => Ok(false),
    }
}
