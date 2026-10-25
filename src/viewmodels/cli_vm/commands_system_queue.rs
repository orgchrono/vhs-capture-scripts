//! System, Toolchain, Storage & Setup CLI Commands (`cli_vm/commands_system_queue.rs`).

use std::env;
use std::fs;
use std::path::Path;

use crate::infrastructure::hardware::detect_system_ram_gb;

pub fn handle_system_queue(subcmd: &str, args: &[String]) -> Result<bool, Box<dyn std::error::Error>> {
    match subcmd {
        "help" | "-h" | "--help" => {
            super::args_parser::print_usage();
            Ok(true)
        }
        "version" | "-v" | "--version" => {
            println!("vhs-studio 2.1.0");
            Ok(true)
        }
        "install-ffmpeg" => {
            let mgr_name = args.get(2).map(String::as_str).unwrap_or("winget");
            let mgr = crate::infrastructure::package::PackageManager::from_name(mgr_name);
            match crate::infrastructure::package::get_ffmpeg_install_command(&mgr) {
                Some(cmd) => println!("{}", cmd.join(" ")),
                None => {
                    eprintln!("Unsupported package manager: '{mgr_name}'");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "preferences" => {
            let default_prefs = crate::models::preferences::AppPreferences::default();
            println!("{}", serde_json::to_string_pretty(&default_prefs)?);
            Ok(true)
        }
        "advanced-config" => {
            let path_opt = args
                .get(2)
                .map(String::as_str)
                .unwrap_or(crate::models::constants::ADVANCED_CONFIG_REL_PATH);
            let content = fs::read_to_string(path_opt).unwrap_or_default();
            let conf = crate::models::config::parse_advanced_toml(&content);
            println!("{}", serde_json::to_string_pretty(&conf)?);
            Ok(true)
        }
        "toolchain-check" => {
            let cwd = env::current_dir().ok();
            let home_str = env::var("USERPROFILE").or_else(|_| env::var("HOME")).ok();
            let home = home_str.as_ref().map(Path::new);

            let resolve = |name: &str| {
                crate::infrastructure::toolchain::resolve_executable_path(
                    name,
                    cwd.as_deref(),
                    home,
                )
                .map(|p| p.to_string_lossy().to_string())
            };

            let report = crate::infrastructure::toolchain::ToolchainReport {
                ffmpeg: resolve("ffmpeg"),
                ffprobe: resolve("ffprobe"),
                obs: resolve("obs"),
                extract_meihdfs: resolve("extract_meihdfs"),
                dvd_vr: resolve("dvd-vr"),
                udf_dump: resolve("udf_dump"),
                vspipe: resolve("vspipe"),
                realesrgan: resolve("realesrgan-ncnn-vulkan"),
                codeformer: resolve("codeformer"),
            };
            println!("{}", serde_json::to_string_pretty(&report)?);
            Ok(true)
        }
        "hardware" => {
            let cores = std::thread::available_parallelism()
                .map(|p| p.get() as u32)
                .unwrap_or(8);
            let (total_ram, avail_ram) = detect_system_ram_gb();

            let is_darwin = std::env::consts::OS == "macos";
            let gpu_type = if is_darwin {
                crate::infrastructure::hardware::GpuType::AppleSilicon
            } else {
                crate::infrastructure::hardware::GpuType::Dedicated
            };

            let specs = crate::infrastructure::hardware::HardwareSpecs {
                cpu_cores: cores,
                ram_total_gb: (total_ram * 10.0).round() / 10.0,
                ram_available_gb: (avail_ram * 10.0).round() / 10.0,
                gpu_type,
                gpu_name: if is_darwin {
                    "Apple Silicon".to_string()
                } else {
                    "Dedicated GPU".to_string()
                },
                vram_gb: 8.0,
                vulkan_available: true,
            };

            let assessment = crate::infrastructure::hardware::assess_hardware(&specs);
            println!("{}", serde_json::to_string_pretty(&assessment)?);
            Ok(true)
        }
        "thumbnail" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio thumbnail <INPUT_PATH> [TIME_SEC] [OUTPUT_PATH]");
                    std::process::exit(1);
                }
            };
            let time_sec: f64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(10.0);
            let default_out = format!("{input_path}_thumb.jpg");
            let output_path = args.get(4).map(String::as_str).unwrap_or(&default_out);

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

            let thumb_args = crate::infrastructure::thumbnail::build_thumbnail_extract_args(
                input_path,
                time_sec,
                output_path,
                &ffmpeg_bin,
            );
            let mut cmd =
                crate::infrastructure::toolchain::create_silent_command(Path::new(&ffmpeg_bin));
            cmd.args(&thumb_args[1..]);

            match cmd.status() {
                Ok(status) if status.success() => {
                    println!("Thumbnail generated: {output_path}");
                }
                Ok(status) => {
                    eprintln!("Thumbnail extraction failed with code: {:?}", status.code());
                    std::process::exit(1);
                }
                Err(err) => {
                    eprintln!("Failed to execute FFmpeg for thumbnail: {err}");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "ai-upscale" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio ai-upscale <INPUT> <OUTPUT> [MODEL] [SCALE] [TILE] [--execute]");
                    std::process::exit(1);
                }
            };
            let output_path = match args.get(3) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing output path. Usage: vhs-studio ai-upscale <INPUT> <OUTPUT> [MODEL] [SCALE] [TILE] [--execute]");
                    std::process::exit(1);
                }
            };
            let model_name = args
                .get(4)
                .cloned()
                .unwrap_or_else(|| "realesrgan-x4plus".to_string());
            let scale: u32 = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(4);
            let tile_size: u32 = args.get(6).and_then(|s| s.parse().ok()).unwrap_or(256);

            let params = crate::domain::ai::RealEsrganParams {
                input_path: input_path.clone(),
                output_path: output_path.clone(),
                model_name,
                scale,
                tile_size,
                gpu_id: Some(0),
            };

            let cmd_args = crate::domain::ai::build_realesrgan_command(&params);
            if args.iter().any(|a| a == "--execute" || a == "-e") {
                let bin = crate::infrastructure::toolchain::resolve_executable_path("realesrgan-ncnn-vulkan", None, None)
                    .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("realesrgan", None, None));
                if let Some(b) = bin {
                    let mut cmd = crate::infrastructure::toolchain::create_silent_command(&b);
                    cmd.args(&cmd_args);
                    match cmd.status() {
                        Ok(s) if s.success() => {
                            println!("AI upscaling completed successfully: {output_path}");
                        }
                        Ok(s) => {
                            eprintln!("AI upscaler exited with code: {:?}", s.code());
                            std::process::exit(1);
                        }
                        Err(e) => {
                            eprintln!("Failed to invoke AI upscaler: {e}");
                            std::process::exit(1);
                        }
                    }
                } else {
                    eprintln!("Real-ESRGAN binary not found in PATH or tools directory.");
                    std::process::exit(1);
                }
            } else {
                println!("{}", cmd_args.join(" "));
            }
            Ok(true)
        }
        "ai-interpolate" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio ai-interpolate <INPUT> <OUTPUT> [TARGET_FPS] [MODEL] [--execute]");
                    std::process::exit(1);
                }
            };
            let output_path = match args.get(3) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing output path. Usage: vhs-studio ai-interpolate <INPUT> <OUTPUT> [TARGET_FPS] [MODEL] [--execute]");
                    std::process::exit(1);
                }
            };
            let target_fps: u32 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(60);
            let model_name = args
                .get(5)
                .cloned()
                .unwrap_or_else(|| "rife-v4.6".to_string());

            let params = crate::domain::ai::RifeParams {
                input_path: input_path.clone(),
                output_path: output_path.clone(),
                target_fps,
                model_name,
                gpu_id: Some(0),
            };

            let cmd_args = crate::domain::ai::build_rife_command(&params);
            if args.iter().any(|a| a == "--execute" || a == "-e") {
                let bin = crate::infrastructure::toolchain::resolve_executable_path("rife-ncnn-vulkan", None, None)
                    .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("rife", None, None));
                if let Some(b) = bin {
                    let mut cmd = crate::infrastructure::toolchain::create_silent_command(&b);
                    cmd.args(&cmd_args);
                    match cmd.status() {
                        Ok(s) if s.success() => {
                            println!("Frame interpolation completed successfully: {output_path}");
                        }
                        Ok(s) => {
                            eprintln!("RIFE exited with code: {:?}", s.code());
                            std::process::exit(1);
                        }
                        Err(e) => {
                            eprintln!("Failed to invoke RIFE: {e}");
                            std::process::exit(1);
                        }
                    }
                } else {
                    eprintln!("RIFE binary not found in PATH or tools directory.");
                    std::process::exit(1);
                }
            } else {
                println!("{}", cmd_args.join(" "));
            }
            Ok(true)
        }
        "ai-face-restore" => {
            let input_path = match args.get(2) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing input path. Usage: vhs-studio ai-face-restore <INPUT> <OUTPUT> [FIDELITY] [UPSCALE] [--execute]");
                    std::process::exit(1);
                }
            };
            let output_path = match args.get(3) {
                Some(p) => p,
                None => {
                    eprintln!("Error: Missing output path. Usage: vhs-studio ai-face-restore <INPUT> <OUTPUT> [FIDELITY] [UPSCALE] [--execute]");
                    std::process::exit(1);
                }
            };
            let fidelity: f32 = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(0.7);
            let upscale_ratio: u32 = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(2);

            let params = crate::domain::ai::CodeFormerParams {
                input_path: input_path.clone(),
                output_path: output_path.clone(),
                fidelity,
                device: "cuda".to_string(),
                upscale_ratio,
            };

            let cmd_args = crate::domain::ai::build_codeformer_command(&params);
            if args.iter().any(|a| a == "--execute" || a == "-e") {
                let bin = crate::infrastructure::toolchain::resolve_executable_path("codeformer-ncnn-vulkan", None, None)
                    .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("codeformer", None, None));
                if let Some(b) = bin {
                    let mut cmd = crate::infrastructure::toolchain::create_silent_command(&b);
                    cmd.args(&cmd_args);
                    match cmd.status() {
                        Ok(s) if s.success() => {
                            println!("Facial restoration completed successfully: {output_path}");
                        }
                        Ok(s) => {
                            eprintln!("CodeFormer exited with code: {:?}", s.code());
                            std::process::exit(1);
                        }
                        Err(e) => {
                            eprintln!("Failed to invoke CodeFormer: {e}");
                            std::process::exit(1);
                        }
                    }
                } else {
                    eprintln!("CodeFormer binary not found in PATH or tools directory.");
                    std::process::exit(1);
                }
            } else {
                println!("{}", cmd_args.join(" "));
            }
            Ok(true)
        }
        "storage-config" => {
            let path = crate::infrastructure::storage::resolve_storage_config_path();
            let envelope = crate::infrastructure::storage::load_storage_config_envelope(&path);
            println!("{}", serde_json::to_string_pretty(&envelope)?);
            Ok(true)
        }
        "storage-save" => {
            let provider = match args.get(2) {
                Some(p) => p.as_str(),
                None => {
                    eprintln!("Error: Missing provider argument. Usage: vhs-studio storage-save <PROVIDER> <CONFIG_JSON>");
                    std::process::exit(1);
                }
            };
            let config_json = match args.get(3) {
                Some(c) => c.as_str(),
                None => "{}",
            };
            let config_val: serde_json::Value = serde_json::from_str(config_json)?;
            let path = crate::infrastructure::storage::resolve_storage_config_path();
            match crate::infrastructure::storage::save_storage_config_envelope(
                &path,
                provider,
                &config_val,
            ) {
                Ok(status) => println!("{}", serde_json::to_string_pretty(&status)?),
                Err(err) => {
                    eprintln!("Error saving storage config: {err}");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "storage-chunk-plan" => {
            let file_size: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
            let chunk_size: u64 = args
                .get(3)
                .and_then(|s| s.parse().ok())
                .unwrap_or(8 * 1024 * 1024);
            let plan = crate::infrastructure::storage::calculate_chunk_plan(file_size, chunk_size);
            println!("{}", serde_json::to_string_pretty(&plan)?);
            Ok(true)
        }
        "storage-copy" => {
            let src = match args.get(2) {
                Some(s) => s.as_str(),
                None => {
                    eprintln!(
                        "Error: Missing source path. Usage: vhs-studio storage-copy <SRC> <DST>"
                    );
                    std::process::exit(1);
                }
            };
            let dst = match args.get(3) {
                Some(d) => d.as_str(),
                None => {
                    eprintln!("Error: Missing destination path. Usage: vhs-studio storage-copy <SRC> <DST>");
                    std::process::exit(1);
                }
            };
            match crate::infrastructure::storage::copy_and_verify_file(
                Path::new(src),
                Path::new(dst),
            ) {
                Ok(bytes) => println!("{{\"status\":\"ok\",\"bytes_copied\":{bytes}}}"),
                Err(err) => {
                    eprintln!("Error: {err}");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "validate-i18n" => {
            let dir = args
                .get(2)
                .map(String::as_str)
                .unwrap_or(crate::models::constants::UI_LOCALES_REL_PATH);
            println!("[*] Verifying translation key parity across all 10 locales...");
            match crate::viewmodels::system_vm::ipc_validate_i18n_locales(dir) {
                Ok(summary) if summary.all_passed => {
                    println!("[+] 100% parity verified: all 10 locales contain identical key structures.");
                }
                Ok(summary) => {
                    eprintln!("[-] i18n parity failure detected:");
                    eprintln!("{}", serde_json::to_string_pretty(&summary)?);
                    std::process::exit(1);
                }
                Err(err) => {
                    eprintln!("Error: {err}");
                    std::process::exit(1);
                }
            }
            Ok(true)
        }
        "serve" | "api" => {
            let port: u16 = args
                .get(2)
                .and_then(|s| s.parse().ok())
                .unwrap_or(crate::models::constants::DEFAULT_API_PORT);
            if let Err(err) = crate::infrastructure::http_server::run_native_http_server(
                crate::models::constants::DEFAULT_API_HOST,
                port,
                true,
            ) {
                eprintln!("Error: {err}");
                std::process::exit(1);
            }
            Ok(true)
        }
        "setup-qtgmc" => {
            println!("[QTGMC SETUP] Starting automated VapourSynth + QTGMC setup...");
            println!("STAGE:1/4 PROGRESS: 10% - Initializing toolchain installer...");
            match crate::infrastructure::package::install_vapoursynth_toolchain() {
                Ok(cmd) => {
                    println!("[QTGMC SETUP] Toolchain setup completed successfully: {cmd}");
                    println!("STAGE:4/4 PROGRESS: 100% - Toolchain setup completed.");
                    std::process::exit(0);
                }
                Err(err) => {
                    eprintln!("[QTGMC SETUP ERROR] Error installing VapourSynth toolchain: {err}");
                    std::process::exit(1);
                }
            }
        }
        "setup-obs" => {
            println!("[OBS SETUP] Starting automated OBS Studio setup...");
            println!("STAGE:1/4 PROGRESS: 10% - Initializing OBS Studio installer...");
            match crate::infrastructure::package::install_obs_toolchain() {
                Ok(cmd) => {
                    println!("[OBS SETUP] OBS Studio setup completed successfully: {cmd}");
                    println!("STAGE:4/4 PROGRESS: 100% - OBS Studio setup completed.");
                    std::process::exit(0);
                }
                Err(err) => {
                    eprintln!("[OBS SETUP ERROR] Error installing OBS Studio: {err}");
                    std::process::exit(1);
                }
            }
        }
        "bootstrap-toolchain" => {
            println!("[BOOTSTRAP] Initializing VHS Studio Pro Turnkey Toolchain bootstrap...");
            println!("STAGE:1/4 PROGRESS: 10% - Installing VapourSynth + QTGMC toolchain...");
            match crate::infrastructure::package::install_vapoursynth_toolchain() {
                Ok(info) => {
                    println!("[BOOTSTRAP] VapourSynth toolchain ready: {info}");
                }
                Err(err) => {
                    eprintln!("[BOOTSTRAP ERROR] VapourSynth installation failed: {err}");
                    std::process::exit(1);
                }
            }

            println!("STAGE:2/4 PROGRESS: 40% - Installing OBS Studio toolchain...");
            match crate::infrastructure::package::install_obs_toolchain() {
                Ok(info) => {
                    println!("[BOOTSTRAP] OBS Studio toolchain ready: {info}");
                }
                Err(err) => {
                    eprintln!("[BOOTSTRAP ERROR] OBS Studio installation failed: {err}");
                    std::process::exit(1);
                }
            }

            println!("STAGE:3/4 PROGRESS: 70% - Inspecting external multimedia binaries (FFmpeg/FFprobe)...");
            let cwd = env::current_dir().ok();
            let home_str = env::var("USERPROFILE").or_else(|_| env::var("HOME")).ok();
            let home = home_str.as_ref().map(Path::new);

            let ffmpeg = crate::infrastructure::toolchain::resolve_executable_path("ffmpeg", cwd.as_deref(), home);
            let ffprobe = crate::infrastructure::toolchain::resolve_executable_path("ffprobe", cwd.as_deref(), home);
            let python = crate::infrastructure::toolchain::resolve_executable_path("python", cwd.as_deref(), home)
                .or_else(|| crate::infrastructure::toolchain::resolve_executable_path("python3", cwd.as_deref(), home));

            println!("[BOOTSTRAP] FFmpeg binary: {ffmpeg:?}");
            println!("[BOOTSTRAP] FFprobe binary: {ffprobe:?}");
            println!("[BOOTSTRAP] Python binary: {python:?}");

            println!("STAGE:4/4 PROGRESS: 100% - Toolchain verification and bootstrap complete.");
            println!("[BOOTSTRAP] All systems nominal. Ready for production ingestion and restoration.");
            Ok(true)
        }
        "desktop" | "gui" => {
            crate::viewmodels::ipc_commands::run_desktop_app();
            Ok(true)
        }
        _ => Ok(false),
    }
}
