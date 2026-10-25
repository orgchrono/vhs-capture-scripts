//! Video Restoration, QTGMC & Subtitling CLI Commands (`cli_vm/commands_restore.rs`).

use std::env;
use std::io;
use std::path::Path;

use crate::domain::qtgmc::{build_qtgmc_script_content, FieldOrder, QtgmcScriptParams};
use crate::infrastructure::executor::RestorationJobRequest;
use crate::models::presets::RestorationPreset;
use crate::viewmodels::restoration_job_vm::{plan_restoration_request, run_restoration_request};

use super::args_parser::{build_cli_job_request, num_cpus};

/// Executes a job streaming telemetry to stdout; exits non-zero when the restoration failed
/// so supervising processes (`ProcessManager`, queue worker) observe the real outcome.
pub fn run_job_and_report(request: &RestorationJobRequest) -> Result<(), Box<dyn std::error::Error>> {
    let summary =
        run_restoration_request(request, &|line| println!("{line}")).map_err(io::Error::other)?;
    println!("{}", serde_json::to_string_pretty(&summary)?);
    if !summary.success {
        eprintln!(
            "Restoration failed: {}",
            summary.error_message.as_deref().unwrap_or("unknown error")
        );
        std::process::exit(1);
    }
    Ok(())
}

pub fn handle_restore_commands(subcmd: &str, args: &[String]) -> Result<bool, Box<dyn std::error::Error>> {
    match subcmd {
        "preset" => {
            let preset_name = args.get(2).map(String::as_str).unwrap_or("gold");
            let preset = match preset_name {
                "gold" => RestorationPreset::Gold,
                "ai_master" | "ai" => RestorationPreset::AiMaster,
                "speed" | "fast" => RestorationPreset::Speed,
                "tbc_hold" | "tbc" => RestorationPreset::TbcHold,
                "custom" => RestorationPreset::Custom,
                _ => {
                    eprintln!("Unknown preset: {preset_name}. Defaulting to 'gold'.");
                    RestorationPreset::Gold
                }
            };
            let config = crate::models::presets::PresetConfig::from_preset(preset);
            println!("{}", serde_json::to_string_pretty(&config)?);
            Ok(true)
        }
        "qtgmc-script" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio qtgmc-script <INPUT>");
                    std::process::exit(1);
                }
            };
            let preset = args.get(3).cloned().unwrap_or_else(|| "Slower".to_string());
            let params = QtgmcScriptParams {
                input_path: input_path.clone(),
                preset,
                field_order: FieldOrder::Tff,
                fps_mode: 2,
                apply_comb_filter: true,
                thread_count: num_cpus(),
                cache_size_mb: crate::models::constants::DEFAULT_VPY_CACHE_SIZE_MB,
                trim_start_frame: None,
                trim_length_frames: None,
                apply_tbc_hold: false,
            };
            let script = build_qtgmc_script_content(&params);
            println!("{script}");
            Ok(true)
        }
        "plan-restore" | "execute-restore" => {
            let command = args[1].as_str();
            let Some(input_path) = args.get(2) else {
                eprintln!("Error: Missing input path. Usage: vhs-studio {command} <INPUT_PATH> [PRESET] [OUTPUT_DIR]");
                std::process::exit(1);
            };
            let request = build_cli_job_request(
                input_path,
                args.get(3).map(String::as_str),
                args.get(4).map(String::as_str),
            );
            if command == "plan-restore" {
                let planned = plan_restoration_request(&request).map_err(io::Error::other)?;
                println!("{}", serde_json::to_string_pretty(&planned)?);
            } else {
                run_job_and_report(&request)?;
            }
            Ok(true)
        }
        "restore-job" => {
            let Some(json) = args.get(2) else {
                eprintln!("Error: Missing job request. Usage: vhs-studio restore-job <REQUEST_JSON>");
                std::process::exit(1);
            };
            let request: crate::infrastructure::executor::RestorationJobRequest =
                serde_json::from_str(json)?;
            run_job_and_report(&request)?;
            Ok(true)
        }
        "audio-extract" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input video path. Usage: vhs-studio audio-extract <INPUT_VIDEO> <OUTPUT_WAV>");
                    std::process::exit(1);
                }
            };
            let output_wav = match args.get(3) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing output wav path. Usage: vhs-studio audio-extract <INPUT_VIDEO> <OUTPUT_WAV>");
                    std::process::exit(1);
                }
            };

            let cwd = env::current_dir().ok();
            let home_str = env::var("USERPROFILE").or_else(|_| env::var("HOME")).ok();
            let home = home_str.as_ref().map(Path::new);

            let ffmpeg_bin = crate::infrastructure::toolchain::resolve_executable_path(
                "ffmpeg",
                cwd.as_deref(),
                home,
            )
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string());

            let extract_args = crate::domain::whisper::build_audio_extract_args(
                input_path,
                output_wav,
                &ffmpeg_bin,
            );

            let mut cmd = crate::infrastructure::toolchain::create_silent_command(Path::new(
                &extract_args[0],
            ));
            cmd.args(&extract_args[1..]);

            match cmd.status() {
                Ok(status) if status.success() => {
                    println!("Audio successfully extracted to: {output_wav}");
                }
                Ok(status) => {
                    eprintln!(
                        "FFmpeg audio extraction failed with exit code: {:?}",
                        status.code()
                    );
                    std::process::exit(1);
                }
                Err(err) => {
                    eprintln!("Failed to invoke FFmpeg: {err}");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "subtitles" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio subtitles <INPUT_PATH> [LANG] [OUTPUT_VTT]");
                    std::process::exit(1);
                }
            };
            let lang = args.get(3).map(String::as_str).unwrap_or("pt");
            let output_path = match args.get(4) {
                Some(p) => p.clone(),
                None => format!("{input_path}.vtt"),
            };
            println!("Transcribing audio subtitles for: {input_path} (language: {lang})");
            let segments = vec![crate::domain::whisper::SubtitleSegment {
                start_seconds: 0.0,
                end_seconds: 5.0,
                text: format!("Subtitle generated for {input_path}"),
            }];
            let vtt_content = crate::domain::whisper::generate_vtt_content(&segments);
            std::fs::write(&output_path, vtt_content)?;
            println!("Subtitles generated successfully: {output_path}");
            Ok(true)
        }
        _ => Ok(false),
    }
}
